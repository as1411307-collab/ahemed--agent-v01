export function buildPlannerPrompt(prompt: string, context?: string): string {
  const contextBlock = context ? `\nContext:\n${context}\n` : "";

  return `
You are planning a task for a local AI agent.

Task:\n${prompt}\n${contextBlock}

Return a concise, operational plan in this format:
1. Goal
2. Required context / files
3. Steps to execute
4. Risks or safety checks
5. Final answer expected
`;
}
