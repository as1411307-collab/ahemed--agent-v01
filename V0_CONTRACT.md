# V0_CONTRACT — AHMED App <-> Core API

Contract version: `"0.1"`.
This file is the single source of truth for the contract. `packages/contract/src/index.ts`
mirrors it field-for-field; both the Core and the mobile app import those types.

All endpoints require `Authorization: Bearer <APP_TOKEN>`. Missing or wrong token -> `401` with an
`ERROR` response (`error.code = "UNAUTHORIZED"`).

All timestamps are ISO-8601 UTC strings. All ids are opaque strings (UUIDs).

---

## 1. Request — `AgentRequest`

Sent as the `payload` field (JSON string) of a `multipart/form-data` body to `POST /v1/messages`.
An optional `file` part carries the uploaded file.

| field            | type                   | notes |
|------------------|------------------------|-------|
| contract_version | `"0.1"`                | required |
| request_id       | string                 | required, unique per request. Re-sending the same `request_id` returns the existing task (safe retry). |
| conversation_id  | string                 | required, generated and stored by the app |
| input_type       | `"text"` \| `"file"`   | `"file"` requires the `file` part |
| message          | string                 | required (non-empty) for `"text"`, may be empty for `"file"` |
| attachments      | `Attachment[]`         | required (may be empty). The app sends `name`, `mime_type`, `size_bytes`. |
| client_context   | `ClientContext`        | optional |

`Attachment`:

| field          | type    | notes |
|----------------|---------|-------|
| name           | string  | original file name |
| mime_type      | string? | |
| size_bytes     | number? | |
| workspace_path | string? | set by the Core only: path relative to WORKSPACE_ROOT, e.g. `inbox/report.pdf` |

`ClientContext`: `{ platform?: string, app_version?: string, locale?: string }`.

## 2. Response — `AgentResponse`

| field            | type                 | notes |
|------------------|----------------------|-------|
| contract_version | `"0.1"`              | |
| request_id       | string \| null       | request that created the task (null for errors before parsing) |
| response_type    | `ResponseType`       | see below |
| task_id          | string \| null       | |
| status           | `TaskStatus` \| null | |
| message          | string \| null       | human-readable text (agent reply, summary, result) |
| data             | object \| null       | depends on `response_type` |
| error            | `AgentError` \| null | `{ code: ErrorCode, message: string }` |

`ResponseType`: `MESSAGE` | `TASK_STATUS` | `APPROVAL_REQUEST` | `RESULT` | `ERROR`

| response_type      | when | data |
|--------------------|------|------|
| `TASK_STATUS`      | task still running (`RECEIVED`, `PROCESSING`, `APPROVED`, `EXECUTING`, `VERIFYING`) | `TaskStatusData` or null |
| `APPROVAL_REQUEST` | status `WAITING_FOR_APPROVAL` | `ApprovalRequest` |
| `MESSAGE`          | `COMPLETED` task where the agent only answered (no tool) | null |
| `RESULT`           | `COMPLETED` task that used a tool, or a `REJECTED` task | `ResultData` |
| `ERROR`            | `FAILED` task, or a request-level error | `ResultData` or null |

`TaskStatus`: `RECEIVED` | `PROCESSING` | `WAITING_FOR_APPROVAL` | `APPROVED` | `REJECTED` |
`EXECUTING` | `VERIFYING` | `COMPLETED` | `FAILED`

`TaskStatusData`: `{ attachments?: Attachment[] }` (files stored by the Core for this request).

### 2.1 Approval request (inside `data` when `response_type = APPROVAL_REQUEST`)

| field             | type                  | notes |
|-------------------|-----------------------|-------|
| action_id         | string                | |
| idempotency_key   | string                | unique per action |
| operation         | string                | e.g. `"move_file"` |
| description       | string                | what will change, human-readable |
| tool              | string                | tool name from the Tool Registry |
| affected_resource | string                | workspace-relative source path |
| destination       | string \| null        | workspace-relative destination path |
| risk_level        | `"read"` \| `"write"` | decided by the Core's Tool Registry, never by the model |
| expires_at        | string                | ISO time; approval valid for 15 minutes |

### 2.2 `ResultData`

| field             | type                                      | notes |
|-------------------|-------------------------------------------|-------|
| action_id         | string?                                   | |
| tool              | string?                                   | |
| affected_resource | string?                                   | |
| destination       | string?                                   | |
| decision          | `"APPROVE"` \| `"REJECT"` \| `"EXPIRED"`? | |
| verified          | boolean?                                  | true only if the Core checked the disk and the change is real |

## 3. Approval decision — `ApprovalDecision`

`POST /v1/tasks/{task_id}/actions/{action_id}/decision` with JSON body:

| field     | type                                      |
|-----------|-------------------------------------------|
| action_id | string (must equal the path `action_id`)  |
| decision  | `"APPROVE"` \| `"REJECT"`                 |

Rules:
- Same decision repeated for the same `action_id` -> `200` with the current task state, no extra execution.
- Different decision after one was recorded -> `409` (`CONFLICT`), nothing changes.
- Decision after `expires_at` -> `410` (`APPROVAL_EXPIRED`), task becomes `REJECTED`, no side effect.
- The write is executed at most once per `idempotency_key`, even with concurrent requests.

Response: `AgentResponse` for the task.

## 4. Endpoints

| method | path | body | response |
|--------|------|------|----------|
| POST | `/v1/messages` | multipart: `payload` (AgentRequest JSON) + optional `file` | `202` `AgentResponse` (`TASK_STATUS`) |
| GET  | `/v1/tasks/{task_id}` | — | `AgentResponse` |
| POST | `/v1/tasks/{task_id}/actions/{action_id}/decision` | `ApprovalDecision` | `AgentResponse` |
| GET  | `/v1/conversations/{conversation_id}` | — | `ConversationResponse` |
| GET  | `/v1/events` | — | `text/event-stream` (section 6) |
| GET  | `/v1/events/page?after=&limit=&wait=&stream_id=` | — | `EventsPage` (section 6.4) |

REST stays the source of truth. The event stream only tells clients *when* to refetch; a client
that cannot stream keeps polling `GET /v1/tasks/{task_id}` (every 2 seconds while a task runs) or
`GET /v1/events/page`.

### 4.1 `ConversationResponse`

| field            | type                                   |
|------------------|----------------------------------------|
| contract_version | `"0.1"`                                |
| conversation_id  | string                                 |
| messages         | `ConversationMessage[]` (oldest first) |
| tasks            | `ConversationTask[]` (newest first)    |

`ConversationMessage`: `{ id, role: "user" | "assistant", content, attachments: Attachment[], task_id: string | null, created_at }`

`ConversationTask`: `{ task_id, user_message, created_at, updated_at, response: AgentResponse }`

## 5. Error codes

`UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `APPROVAL_EXPIRED`, `UNSUPPORTED_FILE_TYPE`,
`PATH_OUTSIDE_WORKSPACE`, `TOOL_ERROR`, `EXECUTION_FAILED`, `MODEL_ERROR`, `INTERRUPTED`, `INTERNAL`.

## 6. Event stream — `GET /v1/events`

A resumable [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream of persisted Core events. Same Bearer header as every endpoint; the token is never accepted
in the URL (so native `EventSource` cannot be used: clients read the body with `fetch`).

Request:
- Cursor: header `Last-Event-ID: <n>` or query `?after=<n>`; the header wins when both are present.
  `n` is a non-negative integer, otherwise `400`.
- `?stream_id=<id>` (optional, recommended with a cursor): the `stream_id` from the last
  `stream.ready`. If it is not this database's id, the cursor is treated as foreign (`stream.reset`).
- No cursor = start from now. Recommended client flow: open the stream, wait for `stream.ready`,
  then load state over REST; every later change arrives as an event, so nothing falls in between.
- Clients should send `Accept-Encoding: identity` (the Core never compresses this route).

Response: `200`, `Content-Type: text/event-stream; charset=utf-8`,
`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `X-Content-Type-Options: nosniff`.
Frames, in order:

| frame | `id:` | `data` | meaning |
|-------|-------|--------|---------|
| `retry: 3000` | — | — | reconnect delay hint (ms), first line of every stream |
| `:` + 2048 spaces (comment) | — | — | padding: iOS may hold the first ~1 KB of a body |
| `event: stream.reset` | newest id | `StreamResetData` | cursor belongs to another database (ahead of the newest event, or other `stream_id`): refetch over REST |
| `event: stream.ready` | — | `StreamReadyData` | stream is live; events with `id > cursor` follow |
| `event: <CoreEventType>` | event id | `StreamedCoreEvent` | one persisted event (`CoreEvent` + `prev_id`) |
| `: hb` (comment) | — | — | heartbeat every 15 s |
| `event: stream.shutdown` | — | `{ contract_version }` | the Core is stopping; reconnect later |

Delivery guarantees:
- Events are written in the same SQLite transaction as the change they describe and sent only after
  it commits: an event exists if and only if the change is real.
- Ids are strictly increasing (one Core process, one SQLite writer). Replay after a cursor and live
  delivery are the same code path: no gap, no repeat on one stream. Ids are NOT contiguous (never
  assume `id + 1`). Each streamed event carries `prev_id`, the id of the previous event on the same
  stream (the starting cursor for the first one): if `prev_id` differs from the last id you applied,
  a frame was lost in transit, so reconnect with your last id. Across reconnects delivery is
  at-least-once; ignore any event with `id <=` the last applied id.
- Clients must ignore unknown `event:` types and unknown fields (new ones may be added).
- The stream is read-only: connecting or disconnecting never changes a task. Approvals expire on a
  Core timer whether or not anyone is connected.
- Limits: at most 8 open streams (opening a 9th closes the oldest, so a client whose old connection
  went half-open can always reconnect); a stream whose socket does not drain for 60 s is closed;
  every stream is ended after 30 minutes. In all cases the client reconnects with its cursor.

### 6.1 `CoreEvent`

| field            | type                   | notes |
|------------------|------------------------|-------|
| contract_version | `"0.1"`                | |
| id               | number                 | stream cursor; equals the SSE `id:` |
| type             | `CoreEventType`        | equals the SSE `event:` |
| ts               | string                 | ISO time the change was committed |
| conversation_id  | string \| null        | |
| task_id          | string \| null        | |
| action_id        | string \| null        | |
| data             | object                 | per type, below. Never message text, file contents, paths or plans: fetch those over REST |

| `CoreEventType`       | written when | `data` |
|-----------------------|--------------|--------|
| `task.created`        | a request created a task | `{ request_id, status: "RECEIVED" }` |
| `task.status_changed` | every state-machine transition | `{ from: TaskStatus, to: TaskStatus, error_code: ErrorCode \| null }` |
| `message.created`     | a user or assistant message was stored | `{ message_id, role: "user" \| "assistant" }` |
| `approval.requested`  | a write action needs approval | `{ operation, tool, risk_level, expires_at }` |
| `approval.decided`    | approved, rejected, or expired | `{ decision: "APPROVE" \| "REJECT" \| "EXPIRED" }` |
| `action.verified`     | the Core checked the disk after executing | `{ verified: boolean }` |

`StreamedCoreEvent` = `CoreEvent` + `prev_id: number` (stream only; see delivery guarantees).

### 6.2 `StreamReadyData`

`{ contract_version, stream_id: string, cursor: number, last_event_id: number }` — events with
`id > cursor` follow; `last_event_id` is the newest event when the stream opened. `stream_id` is a
random id fixed when the Core database was created: keep it with your cursor.

### 6.3 `StreamResetData`

`{ contract_version, stream_id: string, last_event_id: number }` — sent before `stream.ready` when
the requested cursor belongs to another database. The stream continues from `last_event_id`.

### 6.4 `EventsPage` — `GET /v1/events/page?after=<n>&limit=<1-500>&wait=<0-25>&stream_id=<id>`

The same events as JSON, for Replay, backfill, and clients that poll instead of streaming
(e.g. a first Unreal bridge). `after` defaults to 0, `limit` to 500. With `wait=<seconds>` and
nothing newer than `after`, the request waits up to that long for the next committed event
(long-poll; 25 s max, under Unreal's 30 s HTTP activity timeout) and then answers.

| field            | type          | notes |
|------------------|---------------|-------|
| contract_version | `"0.1"`       | |
| stream_id        | string        | this database's id (see 6.2) |
| events           | `CoreEvent[]` | oldest first, all with `id > after` |
| next_cursor      | number        | pass as `after` for the next page (unchanged = caught up) |
| last_event_id    | number        | newest event in the Core |
| reset            | boolean       | `true` when the cursor belongs to another database (ahead of the newest event, or other `stream_id`): refetch state, continue from `next_cursor` |
