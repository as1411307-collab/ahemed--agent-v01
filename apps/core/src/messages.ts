import type { AgentRequest, Attachment } from "@ahmed/contract";
import type { Agent } from "./agent.js";
import type { Store, TaskRow } from "./store.js";

/** One persisted task path for HTTP text/files and trusted voice transcripts. */
export class Messages {
  private readonly jobs = new Map<string, Promise<void>>();

  constructor(private readonly store: Store, private readonly agent: Agent) {}

  submit(request: AgentRequest, attachments: Attachment[] = []): TaskRow {
    const existing = this.store.getTaskByRequestId(request.request_id);
    if (existing) {
      if (existing.conversation_id !== request.conversation_id) throw new Error("request_id conflict");
      return existing;
    }
    const task = this.store.tx(() => {
      this.store.ensureConversation(request.conversation_id);
      const t = this.store.createTask({
        conversationId: request.conversation_id, requestId: request.request_id,
        userMessage: request.message, attachments,
      });
      this.store.addMessage({ conversationId: request.conversation_id, role: "user", content: request.message, attachments, taskId: t.id });
      this.store.audit("REQUEST_RECEIVED", { taskId: t.id }, {
        request_id: request.request_id, conversation_id: request.conversation_id,
        input_type: request.input_type, message: request.message, attachments,
        platform: request.client_context?.platform,
      });
      return t;
    });
    const job = this.agent.processTask(task.id).finally(() => this.jobs.delete(task.id));
    this.jobs.set(task.id, job);
    return task;
  }

  async wait(taskId: string): Promise<void> { await this.jobs.get(taskId); }

  async drain(): Promise<void> {
    while (this.jobs.size) await Promise.allSettled([...this.jobs.values()]);
  }
}
