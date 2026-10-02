import {
  CONTRACT_VERSION,
  type AgentError,
  type AgentResponse,
  type ApprovalRequest,
  type Attachment,
  type ConversationResponse,
  type ErrorCode,
  type ResultData,
} from "@ahmed/contract";
import type { ActionRow, Store, TaskRow } from "./store.js";

export function errorResponse(code: ErrorCode, message: string, extra: Partial<AgentResponse> = {}): AgentResponse {
  return {
    contract_version: CONTRACT_VERSION,
    request_id: null,
    response_type: "ERROR",
    task_id: null,
    status: null,
    message,
    data: null,
    error: { code, message },
    ...extra,
  };
}

export function approvalData(a: ActionRow): ApprovalRequest {
  return {
    action_id: a.id,
    idempotency_key: a.idempotency_key,
    operation: a.operation,
    description: a.description,
    tool: a.tool,
    affected_resource: a.affected_resource,
    destination: a.destination,
    risk_level: a.risk_level,
    expires_at: a.expires_at,
  };
}

function resultData(task: TaskRow, a: ActionRow | undefined): ResultData | null {
  if (a) {
    return {
      action_id: a.id,
      tool: a.tool,
      affected_resource: a.affected_resource,
      destination: a.destination ?? undefined,
      decision: a.decision ?? undefined,
      verified: a.verified === null ? undefined : a.verified === 1,
    };
  }
  return task.used_tool ? { tool: task.used_tool } : null;
}

/** Builds the contract response for a task purely from what is stored in SQLite. */
export function taskResponse(store: Store, task: TaskRow): AgentResponse {
  const action = store.getActionByTask(task.id);
  const error: AgentError | null = task.error_code
    ? { code: task.error_code, message: task.error_message ?? task.error_code }
    : null;
  const base = {
    contract_version: CONTRACT_VERSION,
    request_id: task.request_id,
    task_id: task.id,
    status: task.status,
    message: task.result_message,
    error,
  };
  switch (task.status) {
    case "WAITING_FOR_APPROVAL":
      return { ...base, response_type: "APPROVAL_REQUEST", data: approvalData(action!) };
    case "COMPLETED":
      return task.used_tool
        ? { ...base, response_type: "RESULT", data: resultData(task, action) }
        : { ...base, response_type: "MESSAGE", data: null };
    case "REJECTED":
      return { ...base, response_type: "RESULT", data: resultData(task, action) };
    case "FAILED":
      return { ...base, response_type: "ERROR", data: resultData(task, action) };
    default: {
      const attachments = JSON.parse(task.attachments) as Attachment[];
      return { ...base, response_type: "TASK_STATUS", data: attachments.length ? { attachments } : null };
    }
  }
}

export function conversationResponse(store: Store, conversationId: string): ConversationResponse {
  return {
    contract_version: CONTRACT_VERSION,
    conversation_id: conversationId,
    messages: store.listMessages(conversationId).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: JSON.parse(m.attachments) as Attachment[],
      task_id: m.task_id,
      created_at: m.created_at,
    })),
    tasks: store.listTasks(conversationId).map((t) => ({
      task_id: t.id,
      user_message: t.user_message,
      created_at: t.created_at,
      updated_at: t.updated_at,
      response: taskResponse(store, t),
    })),
  };
}
