# BUILD_PROMPT_V02 — AHMED Agent v0.2: Live Flow Board

## Phase plan (added by the builder after reading the code)

What exists: every task already writes an append-only `audit_log` (REQUEST_RECEIVED, STATUS_CHANGED,
MODEL_RESPONDED, TOOL_CALLED, TOOL_RESULT, TOOL_ERROR, APPROVAL_REQUESTED, DECISION_RECORDED,
APPROVAL_EXPIRED, EXECUTION_*, VERIFICATION, RECOVERY, TASK_*). Missing for a live board: the *start*
of a model step (so a running model call is visible and has a duration), the step number, and short
previews. The board is built in the Core from the task row, the action row and the audit log, and the
app only draws it. No new packages: the board is plain React Native Views (Expo Go compatible).

1. **Phase 1 — Core events, contract, timeline endpoint**
   - Agent: new `MODEL_CALLED {step}` before each model call; `MODEL_RESPONDED` gets `step`,
     `text_chars`; `TOOL_CALLED` stores a short input preview (never file contents, keys or tokens).
   - `packages/contract` + `V0_CONTRACT.md`: additive types `TimelineNode`, `TaskTimeline`
     (contract_version stays `"0.1"`, nothing existing changes).
   - `apps/core/src/timeline.ts`: builds nodes (request, model steps, tool calls, approval wait,
     decision, execution, verification, restart recovery, result) plus "not reached" nodes.
   - `GET /v1/tasks/{task_id}/timeline`: read-only, needs the token.
2. **Phase 2 — Core tests**: timeline for summary (with the loop back to the model), reject,
   approve, failure, restart recovery, a running task, and requests without a token.
3. **Phase 3 — App flow board**: `getTimeline` in the API client; full-screen board (Modal) with
   connected nodes, status colors + legend, tap for details, loop-back arrows, auto-follow of the
   running node, polling every 2 s only while the task is active. Opened from a chat message and
   from the Tasks list.
4. **Phase 4 — Docs**: VISION roadmap (v0.2 flow board, then n8n, memory, voice), CLAUDE.md run/test
   section, `docs/REPORT_V02.md` in Arabic with a step-by-step iPhone test.

---

## The request (verbatim)

Start v0.2: the live flow board. First save this message as docs/BUILD_PROMPT_V02.md. It is the authority for v0.2, and CLAUDE.md rules still apply.

Goal
In the app I can open any task and watch its path live as connected nodes, like an n8n workflow: where it went, where it is now, where it waited for me, where it stopped or failed, and where it looped back to the model.

Rules
- Draw only from real persisted data: task states and the audit log. No fake or demo data.
- If a step isn't recorded yet (model steps, tool calls, approval wait, decision, verification, restart recovery), add audit events for it in the Core. Store short labels and previews only, never file contents, keys, or tokens.
- Contract changes must be additive only. Every existing endpoint and type keeps working. New endpoints are read-only and need the token, for example GET /v1/tasks/{task_id}/timeline.
- The app must keep running in Expo Go (SDK 57). Only add packages Expo Go includes, installed with npx expo install.
- Poll every 2 seconds while a task is active and stop when it ends. No WebSocket.
- Out of scope: n8n, memory, voice, themes, editing flows.

The board
- One node per step, in order, connected by arrows. Model steps and tool calls get their own nodes, so loops back to the model are visible.
- Status colors: done, running now, waiting for my approval, rejected, failed, not reached.
- Tap a node for details: time, duration, tool, short input and result, or the error.
- Open it from a task in the chat and from the Tasks screen. If a task is running, follow it automatically.
- Same dark and gold look as the app. Long flows scroll.

Done when
- Core tests cover the timeline for summary, reject, approve, failure, restart recovery, and requests without a token. All tests pass.
- The roadmap in docs/VISION.md says: v0.2 flow board, then n8n, memory, voice.
- docs/REPORT_V02.md is written in Arabic with a step-by-step iPhone test. Short English summary in the terminal.

How to work
Read the code first, add a short phase plan at the top of docs/BUILD_PROMPT_V02.md, then build phase by phase and commit after each one. Don't wait for me unless you hit a real decision. Don't tag v0.2; I'll tag it after the iPhone test.
