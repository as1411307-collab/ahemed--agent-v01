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
| GET  | `/v1/tasks/{task_id}/timeline` | — | `TaskTimeline` (added in v0.2, read-only, see §6) |

The app polls `GET /v1/tasks/{task_id}` every 2 seconds while the task is still running.
No connection is held open waiting for the user.

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

## 6. Task timeline (added in v0.2, additive)

`GET /v1/tasks/{task_id}/timeline` -> `TaskTimeline`. Read-only, needs the same Bearer token.
Unknown task -> `404` `ERROR` (`NOT_FOUND`). Nothing else in the contract changed; `contract_version`
stays `"0.1"`.

The Core builds the timeline only from persisted data: the task row, its action row and the audit log.
The app only draws it. While `active` is true the app polls this endpoint every 2 seconds.

### 6.1 `TaskTimeline`

| field            | type             | notes |
|------------------|------------------|-------|
| contract_version | `"0.1"`          | |
| task_id          | string           | |
| status           | `TaskStatus`     | current task status |
| active           | boolean          | false once the status is `COMPLETED`, `FAILED` or `REJECTED` |
| created_at       | string           | |
| updated_at       | string           | |
| nodes            | `TimelineNode[]` | in order; the first `NOT_REACHED` node is after the last reached one |

### 6.2 `TimelineNode`

| field          | type                       | notes |
|----------------|----------------------------|-------|
| id             | string                     | stable within the task, e.g. `model-2`, `tool-1` |
| kind           | `TimelineNodeKind`         | `REQUEST` \| `MODEL` \| `TOOL` \| `APPROVAL` \| `DECISION` \| `EXECUTION` \| `VERIFICATION` \| `RECOVERY` \| `RESULT` |
| label          | string                     | short title |
| status         | `TimelineNodeStatus`       | `DONE` \| `RUNNING` \| `WAITING` (for Ahmed's approval) \| `REJECTED` \| `FAILED` \| `NOT_REACHED` |
| started_at     | string \| null             | |
| ended_at       | string \| null             | null while running or waiting |
| duration_ms    | number \| null             | `ended_at - started_at` |
| tool           | string \| null             | |
| input_preview  | string \| null             | short, single line; never file contents, keys or tokens |
| result_preview | string \| null             | short, single line |
| error          | `AgentError` \| null       | |
| loop_back      | boolean                    | true for a model step that follows a tool result (the flow went back to the model) |
