import { createHash, timingSafeEqual } from "node:crypto";
import {registerHermesBridge,isHermesProposalRoute,validBridgeBearer,type HermesBridgeOptions} from "./hermes-bridge.js";
import {ActionBrokerEnforcer, actionDigest, approvalBytes, type ActionEnvelope} from "./security/action-broker.js";
import {SqliteActionStore} from "./security/sqlite-action-store.js";
import {DeviceSessions, type DeviceIdentity} from "./security/device-session.js";
import {canonicalize, type JsonValue} from "./security/canonical.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import {
  CONTRACT_VERSION,
  type AgentRequest,
  type ApprovalDecision,
  type Attachment,
} from "@ahmed/contract";
import { Agent, APPROVAL_TTL_MS } from "./agent.js";
import { openDb } from "./db.js";
import type { ModelClient } from "./model.js";
import { conversationResponse, errorResponse, taskResponse } from "./responses.js";
import { Store, type Clock } from "./store.js";
import { Workspace } from "./workspace.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface CoreOptions {
  dbFile: string;
  workspaceRoot: string;
  /** Used only by historical unit tests. Never supplied by main.ts. */
  appToken?: string;
  deviceSecurity?: { ownerId: string; pairingCode: string | null };
  hermesBridge?: HermesBridgeOptions;
  model: ModelClient;
  /** Dedicated tool restrictions for the explicitly selected production read-only tier. */
  strictCognitiveOnly?: boolean;
  clock?: Clock;
  approvalTtlMs?: number;
  logger?: boolean;
}

export interface Core {
  app: FastifyInstance;
  store: Store;
  agent: Agent;
  workspace: Workspace;
  /** Resolves when all background message processing has finished. */
  drain(): Promise<void>;
  close(): Promise<void>;
}

export async function createCore(opts: CoreOptions): Promise<Core> {
  // Defense in depth: no alternate Core entrypoint may silently bypass the
  // restricted production read-only mode or enable a demo bridge in production.
  if (process.env.NODE_ENV === "production" &&
     (process.env.CORE_PRODUCTION_TIER !== "COGNITIVE_READ_ONLY" ||
      opts.strictCognitiveOnly !== true || !!opts.hermesBridge)) {
    throw new Error("PRODUCTION_REQUIRES_STRICT_COGNITIVE_ONLY");
  }
  // Keep legacy fixtures running in Vitest; no deployed entrypoint accepts APP_TOKEN.
  const oldTestFixture = !opts.deviceSecurity && process.env.NODE_ENV === "test" && !!opts.appToken;
  if (!opts.deviceSecurity && !oldTestFixture) throw new Error("SIGNED_DEVICE_SECURITY_REQUIRED");
  const db = openDb(opts.dbFile);
  const store = new Store(db, opts.clock ?? (() => new Date()));
  const now = () => (opts.clock ? opts.clock().getTime() : Date.now());
  const deviceSecurity = opts.deviceSecurity
    ? new DeviceSessions(db, opts.deviceSecurity.ownerId, opts.deviceSecurity.pairingCode, now)
    : null;
  const brokerStore = deviceSecurity ? new SqliteActionStore(db) : null;
  brokerStore?.quarantineInterrupted();
  if (brokerStore) db.exec(`
    CREATE TABLE IF NOT EXISTS security_signed_previews (
      broker_action_id TEXT PRIMARY KEY, source_action_id TEXT NOT NULL,
      task_id TEXT NOT NULL, owner_id TEXT NOT NULL, device_id TEXT NOT NULL,
      rejected_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS signed_preview_one_source
      ON security_signed_previews(source_action_id);
  `);
  const workspace = new Workspace(opts.workspaceRoot);
  const agent = new Agent(store, workspace, opts.model, opts.approvalTtlMs ?? APPROVAL_TTL_MS,
    !deviceSecurity, opts.strictCognitiveOnly === true);
  agent.recover();

  const inFlight = new Set<Promise<void>>();
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

  // Only four proof/registration endpoints are public. Every other route requires
  // a device-bound short-lived random session, independently of client input.
  const requestIdentity = new WeakMap<object, DeviceIdentity>();
  const expectedFixture = sha256(`Bearer ${opts.appToken ?? ""}`);
  const publicSecurityRoutes = new Set([
    "/v1/security/enroll/challenge", "/v1/security/enroll",
    "/v1/security/session/challenge", "/v1/security/session",
  ]);
  app.addHook("onRequest", async (req, reply) => {
    if (deviceSecurity && opts.hermesBridge && isHermesProposalRoute(req.method,req.url.split("?")[0])) {
      if(validBridgeBearer(req.headers.authorization,opts.hermesBridge.proposalKey))return;
      return reply.code(401).send(errorResponse("UNAUTHORIZED","Hermes proposal-only credentials required."));
    }
    if (deviceSecurity && req.method === "POST" && publicSecurityRoutes.has(req.url.split("?")[0])) return;
    if (deviceSecurity) {
      const identity = deviceSecurity.authenticate(req.headers.authorization);
      if (identity) { requestIdentity.set(req, identity); return; }
    } else if (oldTestFixture &&
      timingSafeEqual(sha256(req.headers.authorization ?? ""), expectedFixture)) return;
    return reply.code(401).send(errorResponse("UNAUTHORIZED", "Signed device session required."));
  });
  function owner(req: object): DeviceIdentity {
    const identity = requestIdentity.get(req);
    if (!identity) throw new Error("SECURITY_REJECT: NO_DEVICE_SESSION");
    return identity;
  }
  function securityFailure(reply: {code: (status: number) => {send: (value: unknown) => unknown}}, e: unknown): unknown {
    const message = e instanceof Error ? e.message : "SECURITY_REJECT";
    // Do not include source envelopes, secrets or user input in error responses.
    const code = message.startsWith("SECURITY_REJECT:") || message.startsWith("EXECUTION_HALTED:")
      ? 403 : message.startsWith("OUTCOME_UNKNOWN:") ? 409 : 400;
    return reply.code(code).send({error:{code:message.split(":")[0],message:message.slice(0,120)}});
  }
  function broker(deviceId: string): ActionBrokerEnforcer {
    if (!deviceSecurity || !brokerStore) throw new Error("SECURITY_REJECT: DISABLED");
    const device = deviceSecurity.getDevice(deviceId);
    if (!device) throw new Error("SECURITY_REJECT: DEVICE_NOT_ENROLLED");
    return new ActionBrokerEnforcer(brokerStore,new Map([[deviceId,device]]),
      // Deliberate no-op dispatcher. The signed approval proves the plumbing,
      // never executes a move or touches an external integration.
      {dispatch: async (e) => ({confirmedReceipt:"DEMO_ONLY_NO_EFFECT:" + actionDigest(e)})},
      (e) => e.serviceId === "workspace" && e.operation === "move_file",
      now);
  }
  type Preview = {broker_action_id:string;source_action_id:string;task_id:string;
    owner_id:string;device_id:string;rejected_at:number|null};
  function previewRow(id: string): Preview | undefined {
    if (!deviceSecurity) return undefined;
    return db.prepare("SELECT * FROM security_signed_previews WHERE broker_action_id=?").get(id) as Preview|undefined;
  }
  function authorizedPreview(id: string, identity: DeviceIdentity): {row:Preview; envelope:ActionEnvelope} {
    const row=previewRow(id);
    if (!row || row.owner_id !== identity.ownerId || row.device_id !== identity.deviceId ||
       !deviceSecurity?.ownsTask(row.task_id,identity.ownerId)) throw new Error("SECURITY_REJECT: PREVIEW_NOT_OWNED");
    if (row.rejected_at !== null) throw new Error("SECURITY_REJECT: PREVIEW_REJECTED");
    const record=brokerStore?.find(id);
    if (!record || record.envelope.ownerId !== identity.ownerId || record.envelope.deviceId !== identity.deviceId ||
        record.envelope.taskId !== row.task_id) throw new Error("SECURITY_REJECT: PREVIEW_MISMATCH");
    return {row,envelope:record.envelope};
  }

  // Owner-authenticated truth endpoint: only facts from the currently deployed Core.
  // Never infer production readiness from a successful HTTP response or a demo signature.
  app.get("/v1/system/capabilities", async () => ({
    schemaVersion: 1,
    mode: opts.strictCognitiveOnly === true && deviceSecurity
      ? "COGNITIVE_READ_ONLY_NOT_ATTESTED"
      : deviceSecurity ? "SIGNED_DEVICE_DEMO_ONLY" : "TEST_FIXTURE_ONLY",
    features: {
      textMessages: "MODEL_ADAPTER_CONFIGURED_NOT_PROVEN",
      fileUploadAndRead: "WORKSPACE_SCOPED",
      modelInputMayLeaveServer: true,
      canonicalMissionLedger: "LEGACY_TASKS",
      hermesMissionLedger: "SEPARATE_DEMO_NOT_AUTHORITATIVE",
      approvalUserPresence: "NOT_ENFORCED",
      sensitiveWorkspaceActions: deviceSecurity ? "BLOCKED" : "TEST_FIXTURE_ONLY",
      signedApprovalEffects: "DEMO_NO_EFFECT",
      hermesRuns: opts.hermesBridge?.transport ? "INJECTED_TRANSPORT_DEMO_ONLY" : "LIVE_RUN_START_BLOCKED",
      n8nWorkflowExecution: "NOT_CONNECTED",
      liveVoice: "NOT_IMPLEMENTED",
    },
  }));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(errorResponse("NOT_FOUND", "Route not found.")));
  app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error(err);
    store.audit("ERROR", {}, { route: req.url, message: err.message });
    return reply
      .code(status)
      .send(errorResponse(status === 500 ? "INTERNAL" : "BAD_REQUEST", status === 500 ? "Internal error." : err.message));
  });


  if(deviceSecurity && brokerStore && opts.hermesBridge) {
    registerHermesBridge({app,db,store,devices:deviceSecurity,brokerStore,
      deviceOwner:(req)=>owner(req),options:opts.hermesBridge,now});
  }

  // ---- device enrollment and short-lived signed authentication ----
  if (deviceSecurity) {
    app.post("/v1/security/enroll/challenge", async (req, reply) => {
      try {
        const body=req.body as {pairingCode?:unknown;deviceId?:unknown;publicKeySpkiPem?:unknown}|null;
        return {payload:deviceSecurity.enrollmentChallenge({
          pairingCode:body?.pairingCode,deviceId:body?.deviceId,publicKeySpkiPem:body?.publicKeySpkiPem,
        })};
      } catch (e) {return securityFailure(reply,e);}
    });
    app.post("/v1/security/enroll", async (req,reply) => {
      try {
        const b=req.body as {challengeId?:unknown;deviceId?:unknown;signatureDerBase64?:unknown}|null;
        return deviceSecurity.enroll({challengeId:b?.challengeId,deviceId:b?.deviceId,signatureDerBase64:b?.signatureDerBase64});
      } catch(e){return securityFailure(reply,e);}
    });
    app.post("/v1/security/session/challenge", async (req,reply) => {
      try {return {payload:deviceSecurity.sessionChallenge((req.body as {deviceId?:unknown}|null)?.deviceId)};}
      catch(e){return securityFailure(reply,e);}
    });
    app.post("/v1/security/session", async(req,reply)=>{
      try {
        const b=req.body as {challengeId?:unknown;deviceId?:unknown;signatureDerBase64?:unknown}|null;
        return deviceSecurity.openSession({challengeId:b?.challengeId,deviceId:b?.deviceId,signatureDerBase64:b?.signatureDerBase64});
      }catch(e){return securityFailure(reply,e);}
    });
    app.get("/v1/security/device",async(req)=>({device:owner(req)}));
    app.post("/v1/security/device/revoke",async(req,reply)=>{
      try {deviceSecurity.revoke(owner(req));return {revoked:true};}
      catch(e){return securityFailure(reply,e);}
    });

    // The preview is generated server-side from a real, owner-scoped pending
    // action. No client-provided tool name, destination or arguments are trusted.
    app.post<{Params:{taskId:string;actionId:string}}>(
      "/v1/tasks/:taskId/actions/:actionId/signed-preview",async(req,reply)=>{
      try {
        const identity=owner(req);
        const {taskId,actionId}=req.params;
        if (!deviceSecurity.ownsTask(taskId,identity.ownerId)) throw new Error("SECURITY_REJECT: TASK_NOT_OWNED");
        const source=store.getAction(actionId);
        const task=store.getTask(taskId);
        if (!source || source.task_id !== taskId || source.decision !== null ||
           task?.status !== "WAITING_FOR_APPROVAL") throw new Error("SECURITY_REJECT: NOT_PENDING");
        const remaining=Date.parse(source.expires_at)-now();
        if (remaining <= 0) throw new Error("SECURITY_REJECT: SOURCE_EXPIRED");
        if (source.tool !== "move_file" || source.operation !== "move_file" || !source.destination)
          throw new Error("SECURITY_REJECT: UNSUPPORTED_ACTION");
        // Retry of the preview request must return the SAME signed envelope,
        // never mint a fresh approval after rejection, expiry or completion.
        const existing=db.prepare("SELECT broker_action_id FROM security_signed_previews WHERE source_action_id=?")
          .get(source.id) as {broker_action_id:string}|undefined;
        if(existing){
          const {row,envelope}=authorizedPreview(existing.broker_action_id,identity);
          const record=brokerStore?.find(envelope.actionId);
          if(!record ||record.status!=="PENDING" ||now()>=envelope.expiresAt)
            throw new Error("SECURITY_REJECT: PREVIEW_NOT_PENDING");
          return {mode:"DEMO_NO_EXECUTION",envelope,digest:actionDigest(envelope)};
        }
        const args=JSON.parse(source.input) as Record<string,JsonValue>;
        const envelope=broker(identity.deviceId).issue({
          taskId,ownerId:identity.ownerId,deviceId:identity.deviceId,serviceId:"workspace",
          operation:"move_file",destination:source.destination,arguments:args,
          policyVersion:"demo-review-only-v1",ttlMs:Math.min(90_000,remaining),
        });
        db.prepare(`INSERT INTO security_signed_previews
          (broker_action_id,source_action_id,task_id,owner_id,device_id)
          VALUES(?,?,?,?,?)`).run(envelope.actionId,source.id,taskId,identity.ownerId,identity.deviceId);
        store.audit("SIGNED_PREVIEW_ISSUED",{taskId,actionId:source.id},{brokerActionId:envelope.actionId,mode:"DEMO_ONLY"});
        return {mode:"DEMO_NO_EXECUTION",envelope,digest:actionDigest(envelope)};
      }catch(e){return securityFailure(reply,e);}
    });
    app.get<{Params:{actionId:string}}>("/v1/security/actions/:actionId",async(req,reply)=>{
      try {
        const {row,envelope}=authorizedPreview(req.params.actionId,owner(req));
        const state=brokerStore!.find(envelope.actionId)!.status;
        return {mode:"DEMO_NO_EXECUTION",envelope,digest:actionDigest(envelope),status:state,sourceActionId:row.source_action_id};
      }catch(e){return securityFailure(reply,e);}
    });
    app.post<{Params:{actionId:string}}>("/v1/security/actions/:actionId/reject",async(req,reply)=>{
      try {
        const identity=owner(req);
        authorizedPreview(req.params.actionId,identity);
        const changed=db.prepare(`UPDATE security_signed_previews SET rejected_at=?
          WHERE broker_action_id=? AND rejected_at IS NULL`).run(now(),req.params.actionId);
        if (changed.changes!==1) throw new Error("SECURITY_REJECT: ALREADY_REJECTED");
        return {status:"DEMO_REJECTED_NO_EXECUTION"};
      }catch(e){return securityFailure(reply,e);}
    });
    app.post<{Params:{actionId:string}}>("/v1/security/actions/:actionId/approve",async(req,reply)=>{
      try {
        const identity=owner(req);
        const {row,envelope}=authorizedPreview(req.params.actionId,identity);
        const source=store.getAction(row.source_action_id);
        const task=store.getTask(row.task_id);
        if(!source ||source.decision!==null || task?.status!=="WAITING_FOR_APPROVAL" ||
           Date.parse(source.expires_at)<=now() ||
           source.destination !== envelope.destination || source.operation !== envelope.operation ||
           canonicalize(JSON.parse(source.input)) !== canonicalize(envelope.arguments))
          throw new Error("SECURITY_REJECT: SOURCE_CHANGED_OR_EXPIRED");
        const signatureDerBase64=(req.body as {signatureDerBase64?:unknown}|null)?.signatureDerBase64;
        if(typeof signatureDerBase64!=="string") throw new Error("SECURITY_REJECT: SIGNATURE_REQUIRED");
        const outcome=await broker(identity.deviceId).executeOrReject({
          actionId:envelope.actionId,deviceId:identity.deviceId,signatureDerBase64,
        });
        store.audit("SIGNED_PREVIEW_VERIFIED",{taskId:row.task_id,actionId:row.source_action_id},
          {brokerActionId:envelope.actionId,mode:"DEMO_NO_EXECUTION",digest:actionDigest(envelope)});
        return {status:"DEMO_SIGNED_NO_EXECUTION",digest:actionDigest(envelope),receipt:outcome.receipt};
      }catch(e){return securityFailure(reply,e);}
    });
  }

  // ---- POST /v1/messages ----
  app.post("/v1/messages", async (req, reply) => {
    // Rejected uploads are audited and logged so a failed send from the phone is never invisible.
    const reject = (status: number, message: string, requestId: string | null = null) => {
      req.log.warn({ status, reason: message }, "message rejected");
      store.audit("REQUEST_REJECTED", {}, { status, reason: message, request_id: requestId, content_type: req.headers["content-type"] ?? null });
      return reply.code(status).send(errorResponse("BAD_REQUEST", message, { request_id: requestId }));
    };
    if (!req.isMultipart()) return reject(400, "Expected multipart/form-data.");

    let payloadRaw: string | undefined;
    let upload: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "file" || upload) {
          await part.toBuffer();
          return reject(400, "Only one file, in the field 'file', is allowed.");
        }
        const buffer = await part.toBuffer();
        if (part.file.truncated) return reject(413, "File is larger than 25 MB.");
        upload = { filename: part.filename, mimetype: part.mimetype, buffer };
      } else if (part.fieldname === "payload") {
        payloadRaw = String(part.value);
      }
    }

    const parsed = parseRequest(payloadRaw);
    if (typeof parsed === "string") return reject(400, parsed);
    const request = parsed;
    if (deviceSecurity && !deviceSecurity.canReadConversation(request.conversation_id,owner(req).ownerId))
      return reject(403,"Conversation is not owned by the active device.");
    if (request.input_type === "file" && !upload) {
      return reject(400, "input_type 'file' requires a 'file' part.", request.request_id);
    }

    // Exact-once task creation is NOT permission to reuse an id for new input.
    if (request.input_type === "text" && upload)
      return reject(400, "Text requests must not include an uploaded file.", request.request_id);
    if (request.input_type === "file" && !upload)
      return reject(400, "File requests must contain the file bytes.", request.request_id);
    const existing = store.getTaskByRequestId(request.request_id);
    if (existing) {
      if (deviceSecurity && !deviceSecurity.ownsTask(existing.id,owner(req).ownerId))
        return reply.code(403).send(errorResponse("UNAUTHORIZED","Task is not owned by this device."));
      if (existing.conversation_id !== request.conversation_id) {
        return reply.code(409).send(errorResponse("CONFLICT", "request_id already used in another conversation."));
      }
      const previous = JSON.parse(existing.attachments) as Attachment[];
      const sameShape = existing.user_message === request.message &&
        (request.input_type === "file") === (previous.length === 1);
      let sameFile = request.input_type === "text";
      if (request.input_type === "file" && previous.length === 1 && upload) {
        const old = previous[0];
        const currentName = (typeof request.attachments[0]?.name === "string" &&
          request.attachments[0].name.trim()) || upload.filename || "upload";
        if (old.workspace_path && old.name === currentName &&
            old.size_bytes === upload.buffer.length) {
          try {
            const onDisk = readFileSync(workspace.resolve(old.workspace_path));
            sameFile = createHash("sha256").update(onDisk).digest("hex") ===
              createHash("sha256").update(upload.buffer).digest("hex");
          } catch { sameFile = false; }
        }
      }
      if (!sameShape || !sameFile)
        return reply.code(409).send(errorResponse("CONFLICT",
          "request_id was reused with different or unverifiable content."));
      return reply.code(200).send(taskResponse(store, existing));
    }

    const attachments: Attachment[] = [];
    if (upload) {
      // Prefer the name from the JSON payload: multipart header filenames are not reliably UTF-8.
      const meta = request.attachments[0];
      const name = (typeof meta?.name === "string" && meta.name.trim()) || upload.filename || "upload";
      const rel = storeUpload(workspace, name, upload.buffer);
      attachments.push({
        name,
        mime_type: upload.mimetype || meta?.mime_type,
        size_bytes: upload.buffer.length,
        workspace_path: rel,
      });
    }

    const task = store.tx(() => {
      if (deviceSecurity) deviceSecurity.claimConversation(request.conversation_id,owner(req).ownerId);
      store.ensureConversation(request.conversation_id);
      const t = store.createTask({
        conversationId: request.conversation_id,
        requestId: request.request_id,
        userMessage: request.message,
        attachments,
      });
      store.addMessage({ conversationId: request.conversation_id, role: "user", content: request.message, attachments, taskId: t.id });
      store.audit("REQUEST_RECEIVED", { taskId: t.id }, {
        request_id: request.request_id,
        conversation_id: request.conversation_id,
        input_type: request.input_type,
        message: request.message,
        attachments,
      });
      return t;
    });

    const job = agent.processTask(task.id).finally(() => inFlight.delete(job));
    inFlight.add(job);
    return reply.code(202).send(taskResponse(store, store.getTask(task.id)!));
  });

  // ---- GET /v1/tasks/:taskId ----
  app.get<{ Params: { taskId: string } }>("/v1/tasks/:taskId", async (req, reply) => {
    agent.expireStale();
    const task = store.getTask(req.params.taskId);
    if (deviceSecurity && (!task || !deviceSecurity.ownsTask(task.id,owner(req).ownerId)))
      return reply.code(404).send(errorResponse("NOT_FOUND","Task not found."));
    if (!task) return reply.code(404).send(errorResponse("NOT_FOUND", "Task not found."));
    return taskResponse(store, task);
  });

  // ---- POST /v1/tasks/:taskId/actions/:actionId/decision ----
  app.post<{ Params: { taskId: string; actionId: string } }>(
    "/v1/tasks/:taskId/actions/:actionId/decision",
    async (req, reply) => {
      const { taskId, actionId } = req.params;
      if (deviceSecurity && !deviceSecurity.ownsTask(taskId,owner(req).ownerId))
        return reply.code(404).send(errorResponse("NOT_FOUND","Task not found."));
      const body = req.body as Partial<ApprovalDecision> | undefined;
      // Hard stop: ALL legacy APPROVE calls are prohibited for signed devices.
      // Only the separate dry-run broker route can verify a signature.
      if (deviceSecurity && body?.decision === "APPROVE")
        return reply.code(403).send(errorResponse("UNAUTHORIZED","Unsigned approval disabled. No action executed."));
      if (!body || body.action_id !== actionId || (body.decision !== "APPROVE" && body.decision !== "REJECT")) {
        return reply
          .code(400)
          .send(errorResponse("BAD_REQUEST", "Body must be {action_id (same as in the URL), decision: APPROVE|REJECT}."));
      }
      const outcome = agent.decide(taskId, actionId, body.decision);
      switch (outcome.kind) {
        case "not_found":
          return reply.code(404).send(errorResponse("NOT_FOUND", "No such action for this task."));
        case "conflict":
          return reply.code(409).send(
            errorResponse("CONFLICT", `A different decision (${outcome.recorded}) was already recorded.`, {
              request_id: outcome.task.request_id,
              task_id: outcome.task.id,
              status: outcome.task.status,
            }),
          );
        case "expired":
          return reply.code(410).send(taskResponse(store, outcome.task));
        case "ok":
          return taskResponse(store, outcome.task);
      }
    },
  );

  // ---- GET /v1/conversations/:conversationId ----
  app.get<{ Params: { conversationId: string } }>("/v1/conversations/:conversationId", async (req, reply) => {
    if (deviceSecurity && !deviceSecurity.canReadConversation(req.params.conversationId,owner(req).ownerId))
      return reply.code(404).send(errorResponse("NOT_FOUND","Conversation not found."));
    agent.expireStale();
    return conversationResponse(store, req.params.conversationId);
  });

  const drain = async () => {
    while (inFlight.size) await Promise.allSettled([...inFlight]);
  };

  return {
    app,
    store,
    agent,
    workspace,
    drain,
    close: async () => {
      await drain();
      await app.close();
      db.close();
    },
  };
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function parseRequest(raw: string | undefined): AgentRequest | string {
  if (!raw) return "Missing 'payload' field.";
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return "'payload' is not valid JSON.";
  }
  if (p === null || typeof p !== "object") return "'payload' must be an object.";
  if (p.contract_version !== CONTRACT_VERSION) return `contract_version must be "${CONTRACT_VERSION}".`;
  for (const k of ["request_id", "conversation_id"] as const) {
    if (typeof p[k] !== "string" || !(p[k] as string).trim() || (p[k] as string).length > 100) {
      return `'${k}' must be a non-empty string.`;
    }
  }
  if (p.input_type !== "text" && p.input_type !== "file") return "'input_type' must be \"text\" or \"file\".";
  if (typeof p.message !== "string") return "'message' must be a string.";
  if (p.input_type === "text" && !p.message.trim()) return "'message' is required for text input.";
  if (!Array.isArray(p.attachments)) return "'attachments' must be an array.";
  if (p.client_context !== undefined && (typeof p.client_context !== "object" || p.client_context === null)) {
    return "'client_context' must be an object.";
  }
  return {
    contract_version: CONTRACT_VERSION,
    request_id: p.request_id as string,
    conversation_id: p.conversation_id as string,
    input_type: p.input_type,
    message: p.message,
    attachments: (p.attachments as Attachment[]).filter((a) => a && typeof a === "object"),
    client_context: p.client_context as AgentRequest["client_context"],
  };
}

/** Saves an upload to inbox/ with a safe, unique name. Returns the workspace-relative path. */
function storeUpload(ws: Workspace, original: string, data: Buffer): string {
  const base = path.basename(original || "upload").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/, "").trim() || "upload";
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length) || "upload";
  for (let i = 0; i < 1000; i++) {
    const name = i === 0 ? `${stem}${ext}` : `${stem}-${i}${ext}`;
    const abs = ws.resolve(`inbox/${name}`);
    if (existsSync(abs)) continue;
    writeFileSync(abs, data, { flag: "wx" });
    return ws.relative(abs);
  }
  throw new Error("Could not find a free file name in inbox/.");
}
