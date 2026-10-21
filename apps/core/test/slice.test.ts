import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationTask, ResultData } from "@ahmed/contract";
import type { Core } from "../src/server.js";
import {
  AUTH,
  approval,
  countEvents,
  decide,
  getConversation,
  getTask,
  makeEnv,
  makePdf,
  multipart,
  requestPayload,
  scriptedModel,
  send,
  sendAndWait,
  startCore,
  type Env,
} from "./helpers.js";

const CONV = "conv-1";
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

/** Upload + summarize, then ask to move. Returns the task waiting for approval. */
async function uploadAndRequestMove(file = REPORT) {
  const read = await sendAndWait(core, CONV, "لخص لي هذا الملف", file);
  expect(read.status).toBe("COMPLETED");
  const move = await sendAndWait(core, CONV, "انقل الملف إلى مجلد archive");
  expect(move.status).toBe("WAITING_FOR_APPROVAL");
  return move;
}

describe("1. read a file and summarize it", () => {
  // ... existing tests unchanged ...
});

// ... existing test contents unchanged ...

describe("10. security: workspace boundary and app token", () => {
  async function withModel(override: Parameters<typeof scriptedModel>[0]) {
    await core.close();
    core = await startCore(env, scriptedModel(override));
  }

  it("rejects a path whose parent directory is a symlink to outside, even when the final file does not exist", async () => {
    const outside = path.join(env.dir, "outside");
    mkdirSync(outside);
    writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET");
    symlinkSync(outside, ws("escape"), "junction");
    await withModel(() => ({ toolCalls: [{ name: "read_file", input: { path: "escape/ghost.txt" } }] }));
    const res = await sendAndWait(core, CONV, "read it");
    expect(res.status).toBe("FAILED");
    expect(res.error?.code).toBe("PATH_OUTSIDE_WORKSPACE");
  });

  it("rejects read_file outside the workspace ('..', absolute path)", async () => {
    writeFileSync(path.join(env.dir, "secret.txt"), "TOP SECRET");
    for (const p of ["../secret.txt", path.join(env.dir, "secret.txt"), "inbox/../../secret.txt"]) {
      await withModel(() => ({ toolCalls: [{ name: "read_file", input: { path: p } }] }));
      const res = await sendAndWait(core, CONV, "read it");
      expect(res.status).toBe("FAILED");
      expect(res.error?.code).toBe("PATH_OUTSIDE_WORKSPACE");
      expect(JSON.stringify(core.store.listAudit())).not.toContain("TOP SECRET");
    }
  });

  // ... existing tests unchanged ...
});
