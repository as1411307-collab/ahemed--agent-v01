import { afterEach, expect, it } from "vitest";
import { agentToolRegistry } from "../src/services/toolRegistry.js";
import type { Core } from "../src/server.js";
import { AUTH, makeEnv, scriptedModel, startCore, type Env } from "./helpers.js";

let core: Core | undefined;
let env: Env | undefined;
afterEach(async () => { await core?.close(); env?.cleanup(); });

it("the registry rejects private destinations independently of task approvals", async () => {
  const result = await agentToolRegistry.execute("http_get", { url: "http://169.254.169.254/latest/meta-data/" });
  expect(result).toMatchObject({ ok: false, tool: "http_get" });
  expect(result.result).toContain("public IP");
});

it("direct authenticated execution cannot bypass the network policy", async () => {
  env = makeEnv();
  core = await startCore(env, scriptedModel());
  const payload = { tool_name: "http_get", arguments: { url: "http://127.0.0.1/" } };
  const unauthenticated = await core.app.inject({ method: "POST", url: "/v1/tools/execute", payload });
  expect(unauthenticated.statusCode).toBe(401);
  const response = await core.app.inject({ method: "POST", url: "/v1/tools/execute", headers: AUTH, payload });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ ok: false, tool: "http_get" });
  expect(response.json().result).toContain("public IP");
});
