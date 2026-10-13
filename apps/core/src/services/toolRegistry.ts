import type { ModelToolDef } from "../model.js";
import { readFileTool } from "../tools.js";
import type { Workspace } from "../workspace.js";

export type ToolExecutionResult = {
  ok: boolean;
  tool: string;
  result: unknown;
};

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  executor: (ws: Workspace, args: Record<string, unknown>) => Promise<unknown>;
}

const registry: Record<string, ToolSpec> = {
  read_file: {
    name: "read_file",
    description: "Read a file from the workspace root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative file path" } },
      required: ["path"],
      additionalProperties: false,
    },
    executor: async (ws, args) => await readFileTool(ws, args),
  },
  web_search: {
    name: "web_search",
    description: "Placeholder web search integration.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false,
    },
    executor: async (_ws, args) => ({
      query: typeof args.query === "string" ? args.query : "",
      result: "Web search provider is not configured yet.",
    }),
  },
  http_get: {
    name: "http_get",
    description: "Perform a simple public HTTP GET request.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "HTTP URL" } },
      required: ["url"],
      additionalProperties: false,
    },
    executor: async (_ws, args) => {
      const url = typeof args.url === "string" ? args.url : "";
      const res = await fetch(url);
      return await res.text();
    },
  },
};

export class ToolRegistry {
  listDefinitions(): ModelToolDef[] {
    return Object.values(registry).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  listNames(): string[] {
    return Object.keys(registry);
  }

  async execute(toolName: string, args: Record<string, unknown>, ws?: Workspace): Promise<ToolExecutionResult> {
    const tool = registry[toolName];
    if (!tool) {
      return { ok: false, tool: toolName, result: `Unknown tool: ${toolName}` };
    }

    try {
      const result = await tool.executor(ws as Workspace, args);
      return { ok: true, tool: toolName, result };
    } catch (error) {
      return { ok: false, tool: toolName, result: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const agentToolRegistry = new ToolRegistry();
