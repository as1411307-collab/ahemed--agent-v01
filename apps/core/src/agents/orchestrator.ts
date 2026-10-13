import { LLMService } from "../services/llmService.js";
import { MemoryService } from "../services/memoryService.js";
import { agentToolRegistry } from "../services/toolRegistry.js";
import type { ModelClient } from "../model.js";

export interface OrchestratorInput {
  prompt: string;
  sessionId?: string;
  userId?: string;
  context?: string;
}

export class Orchestrator {
  constructor(private readonly model: ModelClient, private readonly memory: MemoryService) {}

  async run(input: OrchestratorInput) {
    const sessionId = input.sessionId ?? this.memory.createSession({ userId: input.userId ?? "anonymous" });
    const context =
      input.context ??
      this.memory.listSession(sessionId).map((m) => `${m.role}: ${m.content}`).join("\n");

    this.memory.appendMessage(sessionId, "user", input.prompt, { userId: input.userId ?? "anonymous" });

    const llm = new LLMService(this.model);
    const result = await llm.createPlan(input.prompt, context);

    this.memory.appendMessage(sessionId, "assistant", result.plan, {
      type: "plan",
      toolNames: agentToolRegistry.listNames(),
    });

    return { plan: result.plan, tools: agentToolRegistry.listNames(), sessionId };
  }
}
