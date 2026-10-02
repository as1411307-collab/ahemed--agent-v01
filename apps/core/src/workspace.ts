import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { ErrorCode } from "@ahmed/contract";

export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

const caseInsensitive = process.platform === "win32" || process.platform === "darwin";

/**
 * The only place that turns a workspace-relative path into an absolute one.
 * Everything the agent touches must resolve (after realpath) inside `root`.
 */
export class Workspace {
  readonly root: string;

  constructor(root: string) {
    mkdirSync(path.join(root, "inbox"), { recursive: true });
    this.root = realpathSync(root);
  }

  /** Resolves `rel` to an absolute path inside the workspace or throws PATH_OUTSIDE_WORKSPACE. */
  resolve(rel: string): string {
    if (typeof rel !== "string" || rel.trim() === "" || rel.includes("\0")) {
      throw outside(rel, "empty or invalid path");
    }
    const normalized = rel.trim().replace(/\\/g, "/");
    if (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
      throw outside(rel, "absolute paths are not allowed");
    }
    if (normalized.split("/").includes("..")) {
      throw outside(rel, "'..' is not allowed");
    }
    const abs = path.resolve(this.root, normalized);
    if (!this.contains(abs)) throw outside(rel, "resolves outside the workspace");

    // Follow symlinks/junctions: the nearest existing ancestor must really be inside.
    let probe = abs;
    while (!existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const real = realpathSync(probe);
    if (!this.contains(real)) throw outside(rel, "a link points outside the workspace");
    return abs;
  }

  /** Workspace-relative, forward-slash form of an absolute path inside the workspace. */
  relative(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join("/");
  }

  contains(p: string): boolean {
    const a = caseInsensitive ? p.toLowerCase() : p;
    const r = caseInsensitive ? this.root.toLowerCase() : this.root;
    return a === r || a.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
  }
}

function outside(rel: unknown, why: string): ToolError {
  return new ToolError("PATH_OUTSIDE_WORKSPACE", `Path "${String(rel)}" rejected: ${why}.`);
}
