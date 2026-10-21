import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import type { RiskLevel } from "@ahmed/contract";
import { extractText, getDocumentProxy } from "unpdf";
import { ToolError, type Workspace } from "./workspace.js";

/** Max characters of file text handed to the model. Longer files are cut with an explicit notice. */
const MAX_TEXT_CHARS = 150_000;

export interface ToolSpec {
  name: string;
  description: string;
  /** Decided here, in code. The model never decides whether approval is needed. */
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
}

/** The Tool Registry: the allowlist of tools the agent may use. No delete tool exists in v0.1. */
export const TOOL_REGISTRY: Readonly<Record<string, ToolSpec>> = {
  read_file: {
    name: "read_file",
    risk: "read",
    description:
      "Read the text content of a file in the workspace. Supports .txt, .md and .pdf. " +
      "`path` is relative to the workspace root, e.g. inbox/report.pdf.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative file path" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  move_file: {
    name: "move_file",
    risk: "write",
    description:
      "Move a file to another folder inside the workspace (keeps the file name, never overwrites). " +
      "The folder is created if missing. Paths are workspace-relative, e.g. source inbox/report.pdf, " +
      "destination_dir archive. This changes files, so the user will be asked to approve it first.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Workspace-relative path of the file to move" },
        destination_dir: { type: "string", description: "Workspace-relative destination folder" },
      },
      required: ["source", "destination_dir"],
      additionalProperties: false,
    },
  },
};

export function getTool(name: string): ToolSpec | undefined {
  return Object.hasOwn(TOOL_REGISTRY, name) ? TOOL_REGISTRY[name] : undefined;
}

// ---------- read_file ----------

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

export async function readFileTool(ws: Workspace, input: unknown): Promise<{ path: string; content: string }> {
  const rel = stringField(input, "path");
  const abs = ws.resolve(rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new ToolError("TOOL_ERROR", `File not found: ${rel}`);
  }
  const ext = path.extname(abs).toLowerCase();
  let text: string;
  if (TEXT_EXTENSIONS.has(ext)) {
    text = readFileSync(abs, "utf8");
  } else if (ext === ".pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(readFileSync(abs)));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;
    } catch (err) {
      throw new ToolError("TOOL_ERROR", `Could not extract text from PDF ${rel}: ${(err as Error).message}`);
    }
  } else {
    throw new ToolError(
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported file type "${ext || "(none)"}" for ${rel}. read_file supports .txt, .md and .pdf only.`,
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[NOTE: file truncated to the first ${MAX_TEXT_CHARS} characters of ${text.length}.]`;
  }
  return { path: ws.relative(abs), content: text };
}

// ---------- move_file ----------

export interface MovePlan {
  source: string;
  destination_dir: string;
  /** Final file path (destination_dir + file name). */
  target: string;
  /** Content approved by the user. Absent only in actions saved by older Core versions. */
  source_sha256?: string;
}

/** Validates a move before asking for approval. No side effects. */
export function planMove(ws: Workspace, input: unknown): MovePlan {
  const srcAbs = ws.resolve(stringField(input, "source"));
  const dirAbs = ws.resolve(stringField(input, "destination_dir"));
  if (!existsSync(srcAbs) || !statSync(srcAbs).isFile()) {
    throw new ToolError("TOOL_ERROR", `Source file not found: ${ws.relative(srcAbs)}`);
  }
  if (existsSync(dirAbs) && !statSync(dirAbs).isDirectory()) {
    throw new ToolError("TOOL_ERROR", `Destination is not a folder: ${ws.relative(dirAbs)}`);
  }
  const targetAbs = ws.resolve(path.join(ws.relative(dirAbs), path.basename(srcAbs)));
  if (path.relative(targetAbs, srcAbs) === "") {
    throw new ToolError("TOOL_ERROR", "The file is already in that folder.");
  }
  if (existsSync(targetAbs)) {
    throw new ToolError("TOOL_ERROR", `A file named ${path.basename(srcAbs)} already exists in ${ws.relative(dirAbs)}.`);
  }
  return {
    source: ws.relative(srcAbs),
    destination_dir: ws.relative(dirAbs),
    target: ws.relative(targetAbs),
    source_sha256: fileSha256(srcAbs),
  };
}

/** Performs the move. Only called by the executor after a valid approval and reservation. */
export function executeMove(ws: Workspace, plan: MovePlan): void {
  const srcAbs = ws.resolve(plan.source);
  const dirAbs = ws.resolve(plan.destination_dir);
  const targetAbs = ws.resolve(plan.target);
  if (!existsSync(srcAbs) || !statSync(srcAbs).isFile()) {
    throw new ToolError("EXECUTION_FAILED", `Source file no longer exists: ${plan.source}`);
  }
  if (!plan.source_sha256) {
    throw new ToolError("EXECUTION_FAILED", "This approval has no content fingerprint. Send the move request again.");
  }
  if (fileSha256(srcAbs) !== plan.source_sha256) {
    throw new ToolError("EXECUTION_FAILED", "The source file changed since approval was requested. Send the move request again.");
  }
  mkdirSync(dirAbs, { recursive: true });
  // Re-resolve after mkdir so a link created in between cannot redirect the move.
  ws.resolve(plan.target);
  if (existsSync(targetAbs)) {
    throw new ToolError("EXECUTION_FAILED", `Refusing to overwrite existing file: ${plan.target}`);
  }
  renameSync(srcAbs, targetAbs);
}

/** Checks that the approved content is at the target and gone from the source. Never re-executes. */
export function verifyMove(ws: Workspace, plan: MovePlan): boolean {
  const srcAbs = ws.resolve(plan.source);
  const targetAbs = ws.resolve(plan.target);
  return !!plan.source_sha256 && !existsSync(srcAbs) && existsSync(targetAbs) &&
    statSync(targetAbs).isFile() && fileSha256(targetAbs) === plan.source_sha256;
}

function fileSha256(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

function stringField(input: unknown, key: string): string {
  const v = (input as Record<string, unknown> | null)?.[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new ToolError("TOOL_ERROR", `Missing or invalid "${key}".`);
  }
  return v;
}
