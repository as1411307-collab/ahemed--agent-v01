// Mirrors V0_CONTRACT.md field-for-field. Change both together.

export const CONTRACT_VERSION = "0.1" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type InputType = "text" | "file";

export interface Attachment {
  name: string;
  mime_type?: string;
  size_bytes?: number;
  /** Set by the Core only: path relative to WORKSPACE_ROOT. */
  workspace_path?: string;
}

export interface ClientContext {
  platform?: string;
  app_version?: string;
  locale?: string;
}

export interface AgentRequest {
  contract_version: ContractVersion;
  request_id: string;
  conversation_id: string;
  input_type: InputType;
  message: string;
  attachments: Attachment[];
  client_context?: ClientContext;
}

export const TASK_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "WAITING_FOR_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses after which nothing else will happen to the task. */
export const FINAL_STATUSES: readonly TaskStatus[] = ["COMPLETED", "FAILED", "REJECTED"];

export type ResponseType = "MESSAGE" | "TASK_STATUS" | "APPROVAL_REQUEST" | "RESULT" | "ERROR";

export type RiskLevel = "read" | "write";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "APPROVAL_EXPIRED"
  | "UNSUPPORTED_FILE_TYPE"
  | "PATH_OUTSIDE_WORKSPACE"
  | "TOOL_ERROR"
  | "EXECUTION_FAILED"
  | "MODEL_ERROR"
  | "INTERRUPTED"
  | "INTERNAL";

export interface AgentError {
  code: ErrorCode;
  message: string;
}

export interface ApprovalRequest {
  action_id: string;
  idempotency_key: string;
  operation: string;
  description: string;
  tool: string;
  affected_resource: string;
  destination: string | null;
  risk_level: RiskLevel;
  expires_at: string;
}

export type DecisionValue = "APPROVE" | "REJECT";

export interface ResultData {
  action_id?: string;
  tool?: string;
  affected_resource?: string;
  destination?: string;
  decision?: DecisionValue | "EXPIRED";
  verified?: boolean;
}

export interface TaskStatusData {
  attachments?: Attachment[];
}

export type ResponseData = ApprovalRequest | ResultData | TaskStatusData;

export interface AgentResponse {
  contract_version: ContractVersion;
  request_id: string | null;
  response_type: ResponseType;
  task_id: string | null;
  status: TaskStatus | null;
  message: string | null;
  data: ResponseData | null;
  error: AgentError | null;
}

export interface ApprovalDecision {
  action_id: string;
  decision: DecisionValue;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  task_id: string | null;
  created_at: string;
}

export interface ConversationTask {
  task_id: string;
  user_message: string;
  created_at: string;
  updated_at: string;
  response: AgentResponse;
}

export interface ConversationResponse {
  contract_version: ContractVersion;
  conversation_id: string;
  messages: ConversationMessage[];
  tasks: ConversationTask[];
}

// ---- Event stream: GET /v1/events (V0_CONTRACT.md section 6) ----

export const CORE_EVENT_TYPES = [
  "task.created",
  "task.status_changed",
  "message.created",
  "approval.requested",
  "approval.decided",
  "action.verified",
] as const;
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

export interface TaskCreatedData {
  request_id: string;
  status: "RECEIVED";
}

export interface TaskStatusChangedData {
  from: TaskStatus;
  to: TaskStatus;
  error_code: ErrorCode | null;
}

export interface MessageCreatedData {
  message_id: string;
  role: "user" | "assistant";
}

export interface ApprovalRequestedData {
  operation: string;
  tool: string;
  risk_level: RiskLevel;
  expires_at: string;
}

export interface ApprovalDecidedData {
  decision: DecisionValue | "EXPIRED";
}

export interface ActionVerifiedData {
  verified: boolean;
}

export interface CoreEventDataMap {
  "task.created": TaskCreatedData;
  "task.status_changed": TaskStatusChangedData;
  "message.created": MessageCreatedData;
  "approval.requested": ApprovalRequestedData;
  "approval.decided": ApprovalDecidedData;
  "action.verified": ActionVerifiedData;
}

interface CoreEventOf<T extends CoreEventType> {
  contract_version: ContractVersion;
  /** Strictly increasing stream cursor; also sent as the SSE `id:` line. */
  id: number;
  type: T;
  ts: string;
  conversation_id: string | null;
  task_id: string | null;
  action_id: string | null;
  data: CoreEventDataMap[T];
}

/** One persisted Core event. Details (message text, plans) are fetched over REST, never streamed. */
export type CoreEvent = { [T in CoreEventType]: CoreEventOf<T> }[CoreEventType];

/**
 * Sent (SSE `event: stream.reset`, no `id:`) when the client's cursor is ahead of the Core's newest
 * event, e.g. after the Core database was replaced. The client must drop its cursor, refetch state
 * over REST, and reconnect with `after = last_event_id`.
 */
export interface StreamResetData {
  contract_version: ContractVersion;
  last_event_id: number;
}

/** First frame of every stream (SSE `event: stream.ready`, no `id:`): where delivery starts. */
export interface StreamReadyData {
  contract_version: ContractVersion;
  /** Events with id > cursor follow on this stream. */
  cursor: number;
  /** Newest event id when the stream opened. */
  last_event_id: number;
}

/** GET /v1/events/page response. */
export interface EventsPage {
  contract_version: ContractVersion;
  /** Oldest first, all with id > `after`. */
  events: CoreEvent[];
  /** Pass as `after` to get the next page. */
  next_cursor: number;
  last_event_id: number;
  /** true when `after` is ahead of the newest event (the Core database was replaced): refetch state. */
  reset: boolean;
}
