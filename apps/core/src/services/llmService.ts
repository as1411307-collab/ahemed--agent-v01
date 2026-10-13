import type { ModelClient, ModelRequest } from "../model.js";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt.js";
import { buildPlannerPrompt } from "../prompts/plannerPrompt.js";

export interface LLMPlanResult {
  plan: string;
  raw: unknown;
}

export class LLMService {
  constructor(private readonly model: ModelClient) {}

  async createPlan(prompt: string, context?: string): Promise<LLMPlanResult> {
    const request: ModelRequest = {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPlannerPrompt(prompt, context) }],
      tools: [],
    };

    const turn = await this.model.complete(request);
    const planText = turn.text?.trim() || "No plan returned by the model.";

    return {
      plan: planText,
      raw: turn,
    };
  }
}
