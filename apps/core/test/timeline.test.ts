import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskTimeline, TimelineNode } from "@ahmed/contract";
import { ModelError, type ModelClient } from "../src/model.js";
import { createCore, type Core } from "../src/server.js";
import {
  AUTH,
  approval,
  decide,
  makeEnv,
  scriptedModel,
  send,
  sendAndWait,
  startCore,
  TOKEN,
  type Env,
} from "./helpers.js";

const CONV = "conv-timeline";
const REPORT = { name: "report.txt", content: "Quarterly report: revenue grew 12% and costs fell.", type: "text/plain" };

let env: Env;
let core: Core;

beforeEach(async () => {
  env = makeEnv();
  core = await startCore(env, scriptedModel());
});

afterEach(async () => {
  await core.close().catch(() => {});
  env.cleanup();
});

const ws = (...p: string[]) => path.join(env.wsRoot, ...p);

async function timeline(taskId: string): Promise<TaskTimeline> {
  const res = await core.app.inject({ method: "GET", url: `/v1/tasks/${taskId}/timeline`, headers: AUTH });
  expect(res.statusCode).toBe(200);
  return res.json() as TaskTimeline;
}

const path_ = (t: TaskTimeline) => t.nodes.map((n) => `${n.kind}:${n.status}`);
const node = (t: TaskTimeline, id: string) => t.nodes.find((n) => n.id === id) as TimelineNode;

async function requestMove() {
  const read = await sendAndWait(core, CONV, "لخص لي هذا الملف", REPORT);
  expect(read.status).toBe("COMPLETED");
  const move = await sendAndWait(core, CONV, "انقل الملف إلى مجلد archive");
  expect(move.status).toBe("WAITING_FOR_APPROVAL");
  return move;
}

describe("timeline: summary", () => {
  it("shows request -> model -> tool -> back to the model -> result, all done", async () => {
    const res = await sendAndWait(core, CONV, "لخص لي هذا الملف", REPORT);
    const t = await timeline(res.task_id!);
    expect(t).toMatchObject({ contract_version: "0.1", task_id: res.task_id, status: "COMPLETED", active: false });
    expect(path_(t)).toEqual(["REQUEST:DONE", "MODEL:DONE", "TOOL:DONE", "MODEL:DONE", "RESULT:DONE"]);

    expect(node(t, "request-1").input_preview).toContain("لخص لي هذا الملف");
    expect(node(t, "request-1").input_preview).toContain("report.txt");
    expect(node(t, "model-1")).toMatchObject({ label: "Model step 1", loop_back: false, result_preview: "Asks for tool: read_file" });
    expect(node(t, "tool-1")).toMatchObject({ tool: "read_file", input_preview: '{"path":"inbox/report.txt"}' });
    expect(node(t, "tool-1").result_preview).toContain("inbox/report.txt");
    expect(node(t, "model-2")).toMatchObject({ label: "Model step 2", loop_back: true });
    expect(node(t, "result-1")).toMatchObject({ tool: "read_file", error: null });
    expect(node(t, "result-1").result_preview).toContain("SUMMARY");
    for (const n of t.nodes) {
      expect(n.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(n.duration_ms).toBe(0); // the test clock is frozen
    }

    // The audit log keeps labels and counts, never the file contents.
    expect(JSON.stringify(core.store.listAudit(res.task_id!))).not.toContain("revenue grew");
  });

  it("a plain answer has no tool node and no loop back", async () => {
    const res = await sendAndWait(core, CONV, "hi");
    const t = await timeline(res.task_id!);
    expect(path_(t)).toEqual(["REQUEST:DONE", "MODEL:DONE", "RESULT:DONE"]);
    expect(node(t, "model-1").result_preview).toBe("Answered (12 characters)");
  });

  it("shows a running model step live and the result as not reached", async () => {
    await core.close();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = scriptedModel();
    const gated: ModelClient = { complete: async (req) => (await gate, inner.complete(req)) };
    core = await createCore({ dbFile: env.dbFile, workspaceRoot: env.wsRoot, appToken: TOKEN, model: gated, clock: env.clock });

    const sent = await send(core, CONV, "hi");
    const live = await timeline(sent.body.task_id!);
    expect(live.active).toBe(true);
    expect(live.status).toBe("PROCESSING");
    expect(path_(live)).toEqual(["REQUEST:DONE", "MODEL:RUNNING", "RESULT:NOT_REACHED"]);
    expect(node(live, "model-1").ended_at).toBeNull();

    release();
    await core.drain();
    const done = await timeline(sent.body.task_id!);
    expect(done.active).toBe(false);
    expect(path_(done)).toEqual(["REQUEST:DONE", "MODEL:DONE", "RESULT:DONE"]);
  });
});

describe("timeline: approval", () => {
  it("while waiting, the approval node waits and the rest is not reached", async () => {
    const move = await requestMove();
    const t = await timeline(move.task_id!);
    expect(t.active).toBe(true);
    expect(path_(t)).toEqual([
      "REQUEST:DONE",
      "MODEL:DONE",
      "TOOL:DONE",
      "APPROVAL:WAITING",
      "DECISION:NOT_REACHED",
      "EXECUTION:NOT_REACHED",
      "VERIFICATION:NOT_REACHED",
      "RESULT:NOT_REACHED",
    ]);
    expect(node(t, "tool-1").tool).toBe("move_file");
    expect(node(t, "approval-1").input_preview).toContain("inbox/report.txt");
    expect(node(t, "approval-1").ended_at).toBeNull();
  });

  it("reject: decision rejected, execution and verification never reached", async () => {
    const move = await requestMove();
    env.nowMs += 30_000;
    await decide(core, move.task_id!, approval(move).action_id, "REJECT");
    const t = await timeline(move.task_id!);
    expect(t).toMatchObject({ status: "REJECTED", active: false });
    expect(path_(t)).toEqual([
      "REQUEST:DONE",
      "MODEL:DONE",
      "TOOL:DONE",
      "APPROVAL:REJECTED",
      "DECISION:REJECTED",
      "EXECUTION:NOT_REACHED",
      "VERIFICATION:NOT_REACHED",
      "RESULT:REJECTED",
    ]);
    expect(node(t, "approval-1").duration_ms).toBe(30_000); // how long it waited for Ahmed
  });

  it("approve: decision, execution, verification and result are all done", async () => {
    const move = await requestMove();
    await decide(core, move.task_id!, approval(move).action_id, "APPROVE");
    const t = await timeline(move.task_id!);
    expect(t).toMatchObject({ status: "COMPLETED", active: false });
    expect(path_(t)).toEqual([
      "REQUEST:DONE",
      "MODEL:DONE",
      "TOOL:DONE",
      "APPROVAL:DONE",
      "DECISION:DONE",
      "EXECUTION:DONE",
      "VERIFICATION:DONE",
      "RESULT:DONE",
    ]);
    expect(node(t, "execution-1")).toMatchObject({ tool: "move_file", input_preview: "inbox/report.txt → archive/report.txt" });
    expect(node(t, "result-1").result_preview).toContain("Verified on disk");
  });

  it("an expired approval shows as rejected with the APPROVAL_EXPIRED error", async () => {
    const move = await requestMove();
    env.nowMs += 16 * 60 * 1000;
    const t = await timeline(move.task_id!);
    expect(t.status).toBe("REJECTED");
    expect(node(t, "decision-1")).toMatchObject({ label: "Expired", status: "REJECTED" });
    expect(node(t, "decision-1").error?.code).toBe("APPROVAL_EXPIRED");
  });
});

describe("timeline: failure", () => {
  it("an execution failure marks execution, verification and result as failed", async () => {
    const move = await requestMove();
    mkdirSync(ws("archive"));
    writeFileSync(ws("archive", "report.txt"), "ORIGINAL");
    await decide(core, move.task_id!, approval(move).action_id, "APPROVE");
    const t = await timeline(move.task_id!);
    expect(path_(t).slice(-3)).toEqual(["EXECUTION:FAILED", "VERIFICATION:FAILED", "RESULT:FAILED"]);
    expect(node(t, "execution-1").error?.code).toBe("EXECUTION_FAILED");
    expect(node(t, "result-1").error?.code).toBe("EXECUTION_FAILED");
  });

  it("a tool error stops at the tool node", async () => {
    const res = await sendAndWait(core, CONV, "summarize this", { name: "photo.png", content: "x", type: "image/png" });
    const t = await timeline(res.task_id!);
    expect(path_(t)).toEqual(["REQUEST:DONE", "MODEL:DONE", "TOOL:FAILED", "RESULT:FAILED"]);
    expect(node(t, "tool-1").error?.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("a model error stops at the model node", async () => {
    await core.close();
    const broken: ModelClient = {
      complete: async () => {
        throw new ModelError("Model API error (529): overloaded");
      },
    };
    core = await createCore({ dbFile: env.dbFile, workspaceRoot: env.wsRoot, appToken: TOKEN, model: broken, clock: env.clock });
    const res = await sendAndWait(core, CONV, "hi");
    const t = await timeline(res.task_id!);
    expect(path_(t)).toEqual(["REQUEST:DONE", "MODEL:FAILED", "RESULT:FAILED"]);
    expect(node(t, "model-1").error).toMatchObject({ code: "MODEL_ERROR" });
    expect(node(t, "model-1").error?.message).toContain("overloaded");
  });
});

describe("timeline: restart recovery", () => {
  async function restart() {
    await core.close();
    core = await startCore(env, scriptedModel());
  }

  it("a task stuck in EXECUTING shows the recovery node and the disk check, with no re-run", async () => {
    const move = await requestMove();
    const s = core.store;
    const actionId = approval(move).action_id;
    s.tx(() => {
      s.recordDecision(actionId, "APPROVE");
      s.audit("DECISION_RECORDED", { taskId: move.task_id, actionId }, { decision: "APPROVE" });
      s.transition(move.task_id!, "APPROVED");
      s.insertExecution(s.getAction(actionId)!);
      s.transition(move.task_id!, "EXECUTING");
    });
    expect((await timeline(move.task_id!)).active).toBe(true);
    await restart();

    const t = await timeline(move.task_id!);
    expect(t).toMatchObject({ status: "FAILED", active: false });
    expect(path_(t)).toEqual([
      "REQUEST:DONE",
      "MODEL:DONE",
      "TOOL:DONE",
      "APPROVAL:DONE",
      "DECISION:DONE",
      "RECOVERY:DONE",
      "VERIFICATION:FAILED",
      "RESULT:FAILED",
    ]);
    expect(node(t, "recovery-1").input_preview).toBe("Found the task in EXECUTING");
    expect(node(t, "recovery-1").result_preview).toContain("Not run again");
    expect(t.nodes.some((n) => n.kind === "EXECUTION")).toBe(false);
  });

  it("a model step cut off by a restart is shown as failed (interrupted)", async () => {
    const task = core.store.tx(() => {
      core.store.ensureConversation(CONV);
      const t = core.store.createTask({ conversationId: CONV, requestId: "r-cut", userMessage: "hi", attachments: [] });
      core.store.audit("REQUEST_RECEIVED", { taskId: t.id }, { message: "hi", attachments: [] });
      core.store.transition(t.id, "PROCESSING");
      core.store.audit("MODEL_CALLED", { taskId: t.id }, { step: 1 });
      return t;
    });
    expect(path_(await timeline(task.id))).toEqual(["REQUEST:DONE", "MODEL:RUNNING", "RESULT:NOT_REACHED"]);
    await restart();

    const t = await timeline(task.id);
    expect(path_(t)).toEqual(["REQUEST:DONE", "MODEL:FAILED", "RECOVERY:DONE", "RESULT:FAILED"]);
    expect(node(t, "model-1").error?.code).toBe("INTERRUPTED");
    expect(node(t, "result-1").error?.code).toBe("INTERRUPTED");
  });
});

describe("timeline: auth", () => {
  it("needs the app token and returns 404 for an unknown task", async () => {
    const res = await sendAndWait(core, CONV, "hi");
    const url = `/v1/tasks/${res.task_id}/timeline`;
    for (const authorization of [undefined, "Bearer wrong-token", "test-app-token", "Bearer "]) {
      const r = await core.app.inject({ method: "GET", url, headers: authorization ? { authorization } : {} });
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe("UNAUTHORIZED");
      expect(r.body).not.toContain("REQUEST");
    }
    const missing = await core.app.inject({ method: "GET", url: "/v1/tasks/nope/timeline", headers: AUTH });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });

  it("is read-only: other methods are not routed and nothing is written", async () => {
    const res = await sendAndWait(core, CONV, "hi");
    const before = core.store.listAudit().length;
    await timeline(res.task_id!);
    await timeline(res.task_id!);
    expect(core.store.listAudit().length).toBe(before);
    const post = await core.app.inject({ method: "POST", url: `/v1/tasks/${res.task_id}/timeline`, headers: AUTH });
    expect(post.statusCode).toBe(404);
  });
});
