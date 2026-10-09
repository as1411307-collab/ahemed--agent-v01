import { File } from "expo-file-system";
import {
  CONTRACT_VERSION,
  type AgentRequest,
  type AgentResponse,
  type ApprovalDecision,
  type ConversationResponse,
  type DecisionValue,
  type VoiceSessionAnswer,
  type VoiceSessionSnapshot,
} from "@ahmed/contract";

// The app only knows the Core URL and its own app token. No model keys, no agent logic.
export const CORE_URL = (process.env.EXPO_PUBLIC_CORE_URL ?? "").replace(/\/+$/, "");
const APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  if (!CORE_URL || !APP_TOKEN) {
    throw new ApiError(0, "CONFIG", "Set EXPO_PUBLIC_CORE_URL and EXPO_PUBLIC_APP_TOKEN in apps/mobile/.env, then restart Expo.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${CORE_URL}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${APP_TOKEN}` },
      signal: ctrl.signal,
    });
  } catch (err) {
    // Keep the real reason visible: not every fetch failure is "cannot reach the Core".
    if (ctrl.signal.aborted) {
      throw new ApiError(0, "TIMEOUT", `The Core at ${CORE_URL} did not answer in ${Math.round(timeoutMs / 1000)} s.`);
    }
    const reason = err instanceof Error && err.message ? err.message : String(err);
    throw new ApiError(0, "NETWORK", `Could not send to the Core at ${CORE_URL}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<AgentResponse>) | null;
  // 410 (approval expired) still carries the task state the app should show.
  if (res.ok || res.status === 410) return body as T;
  throw new ApiError(res.status, body?.error?.code ?? "HTTP", body?.error?.message ?? `Request failed (${res.status}).`);
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export function sendMessage(p: {
  requestId: string;
  conversationId: string;
  text: string;
  file?: PickedFile | null;
}): Promise<AgentResponse> {
  const payload: AgentRequest = {
    contract_version: CONTRACT_VERSION,
    request_id: p.requestId,
    conversation_id: p.conversationId,
    input_type: p.file ? "file" : "text",
    message: p.text,
    attachments: p.file ? [{ name: p.file.name, mime_type: p.file.mimeType, size_bytes: p.file.size }] : [],
    client_context: { platform: "expo" },
  };
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  if (p.file) {
    // Expo SDK 57 replaces global fetch with expo/fetch, which rejects React Native's
    // { uri, name, type } file parts ("Unsupported FormDataPart implementation").
    // An expo-file-system File implements Blob and is what expo/fetch can upload.
    // The Core takes the display name from payload.attachments[0].name.
    form.append("file", new File(p.file.uri));
  }
  return call<AgentResponse>("/v1/messages", { method: "POST", body: form }, 120_000);
}

export function getTask(taskId: string): Promise<AgentResponse> {
  return call<AgentResponse>(`/v1/tasks/${encodeURIComponent(taskId)}`);
}

export function decide(taskId: string, actionId: string, decision: DecisionValue): Promise<AgentResponse> {
  const body: ApprovalDecision = { action_id: actionId, decision };
  return call<AgentResponse>(
    `/v1/tasks/${encodeURIComponent(taskId)}/actions/${encodeURIComponent(actionId)}/decision`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

export function getConversation(conversationId: string): Promise<ConversationResponse> {
  return call<ConversationResponse>(`/v1/conversations/${encodeURIComponent(conversationId)}`);
}

export function startVoice(conversationId: string, sdp: string): Promise<VoiceSessionAnswer> {
  return call<VoiceSessionAnswer>("/v1/voice/sessions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, sdp }),
  }, 35_000);
}

export function getVoice(sessionId: string): Promise<VoiceSessionSnapshot> {
  return call<VoiceSessionSnapshot>(`/v1/voice/sessions/${encodeURIComponent(sessionId)}`);
}

export function endVoice(sessionId: string): Promise<VoiceSessionSnapshot> {
  return call<VoiceSessionSnapshot>(`/v1/voice/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export function newId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
