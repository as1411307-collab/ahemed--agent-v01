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

// ---- v0.2 additions (additive only): task timeline for the live flow board ----

export type TimelineNodeKind =
  | "REQUEST"
  | "MODEL"
  | "TOOL"
  | "APPROVAL"
  | "DECISION"
  | "EXECUTION"
  | "VERIFICATION"
  | "RECOVERY"
  | "RESULT";

export type TimelineNodeStatus = "DONE" | "RUNNING" | "WAITING" | "REJECTED" | "FAILED" | "NOT_REACHED";

export interface TimelineNode {
  /** Stable within the task, e.g. "model-2". */
  id: string;
  kind: TimelineNodeKind;
  label: string;
  status: TimelineNodeStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  tool: string | null;
  input_preview: string | null;
  result_preview: string | null;
  error: AgentError | null;
  /** True when this node is the flow going back to the model after a tool result. */
  loop_back: boolean;
}

export interface TaskTimeline {
  contract_version: ContractVersion;
  task_id: string;
  status: TaskStatus;
  /** False once the task reached a final status; the app stops polling then. */
  active: boolean;
  created_at: string;
  updated_at: string;
  nodes: TimelineNode[];
}
