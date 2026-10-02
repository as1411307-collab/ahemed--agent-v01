import {
  CONTRACT_VERSION,
  FINAL_STATUSES,
  type AgentError,
  type ErrorCode,
  type TaskTimeline,
  type TimelineNode,
  type TimelineNodeKind,
  type TimelineNodeStatus,
} from "@ahmed/contract";
import type { Store, TaskRow } from "./store.js";

const PREVIEW_CHARS = 160;

/** One short line for the audit log and the flow board. */
export function preview(text: string | null | undefined, max = PREVIEW_CHARS): string | null {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Canonical order of steps. Used to place "not reached" nodes only after the last reached one. */
const ORDER: Partial<Record<TimelineNodeKind, number>> = {
  REQUEST: 0,
  MODEL: 1,
  TOOL: 1,
  APPROVAL: 2,
  DECISION: 3,
  EXECUTION: 4,
  VERIFICATION: 5,
  RESULT: 6,
};

const PROJECTED_LABELS: Partial<Record<TimelineNodeKind, string>> = {
  APPROVAL: "Waiting for approval",
  DECISION: "Decision",
  EXECUTION: "Run the action",
  VERIFICATION: "Verify on disk",
  RESULT: "Result",
};

type Detail = Record<string, any>;

function duration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Date.parse(end) - Date.parse(start));
}

function err(code: string, message: string): AgentError {
  return { code: code as ErrorCode, message: preview(message, 300) ?? code };
}

/**
 * Builds the flow board for one task purely from persisted data: the task row, its action row
 * and the append-only audit log. Nothing here is invented: a step appears only if it was recorded,
 * and steps that are still ahead are marked NOT_REACHED.
 */
export function buildTimeline(store: Store, task: TaskRow): TaskTimeline {
  const action = store.getActionByTask(task.id);
  const nodes: TimelineNode[] = [];
  const counters: Partial<Record<TimelineNodeKind, number>> = {};

  const add = (kind: TimelineNodeKind, label: string, ts: string | null, extra: Partial<TimelineNode> = {}): TimelineNode => {
    const n = (counters[kind] = (counters[kind] ?? 0) + 1);
    const node: TimelineNode = {
      id: `${kind.toLowerCase()}-${n}`,
      kind,
      label,
      status: "RUNNING",
      started_at: ts,
      ended_at: null,
      duration_ms: null,
      tool: null,
      input_preview: null,
      result_preview: null,
      error: null,
      loop_back: false,
      ...extra,
    };
    if (node.ended_at) node.duration_ms = duration(node.started_at, node.ended_at);
    nodes.push(node);
    return node;
  };
  const close = (node: TimelineNode, ts: string, status: TimelineNodeStatus, extra: Partial<TimelineNode> = {}) => {
    Object.assign(node, { status, ended_at: ts, duration_ms: duration(node.started_at, ts) }, extra);
  };
  const isOpen = (n: TimelineNode) => n.status === "RUNNING" || n.status === "WAITING";
  const open = (kind: TimelineNodeKind) => [...nodes].reverse().find((n) => n.kind === kind && isOpen(n));
  const afterTool = () => nodes.at(-1)?.kind === "TOOL";

  for (const row of store.listAudit(task.id)) {
    const d = (row.detail ? JSON.parse(row.detail) : {}) as Detail;
    const ts = row.ts;
    switch (row.event) {
      case "REQUEST_RECEIVED": {
        const files = ((d.attachments ?? []) as { name: string }[]).map((a) => a.name);
        add("REQUEST", "Request received", ts, {
          status: "DONE",
          ended_at: ts,
          input_preview: preview([d.message, files.length ? `File: ${files.join(", ")}` : ""].filter(Boolean).join(" · ")),
        });
        break;
      }
      case "MODEL_CALLED":
        add("MODEL", `Model step ${d.step}`, ts, { loop_back: afterTool() });
        break;
      case "MODEL_RESPONDED": {
        // Tasks from v0.1 recorded only the response, not the start of the call.
        const node = open("MODEL") ?? add("MODEL", `Model step ${d.step ?? (counters.MODEL ?? 0) + 1}`, ts, { loop_back: afterTool() });
        const calls = (d.tool_calls ?? []) as string[];
        close(node, ts, "DONE", {
          result_preview: calls.length
            ? `Asks for tool: ${calls.join(", ")}`
            : `Answered${typeof d.text_chars === "number" ? ` (${d.text_chars} characters)` : ""}`,
        });
        break;
      }
      case "TOOL_CALLED":
        add("TOOL", `Tool: ${d.tool}`, ts, {
          tool: d.tool,
          input_preview: preview(typeof d.input === "string" ? d.input : JSON.stringify(d.input ?? null)),
        });
        break;
      case "TOOL_RESULT": {
        const node = open("TOOL");
        if (node) close(node, ts, "DONE", { result_preview: preview(`Read ${d.chars} characters from ${d.path}`) });
        break;
      }
      case "TOOL_ERROR": {
        const node = open("TOOL");
        if (node) close(node, ts, "FAILED", { error: err(d.code, d.message) });
        break;
      }
      case "APPROVAL_REQUESTED": {
        const tool = open("TOOL");
        if (tool) close(tool, ts, "DONE", { result_preview: "Write action: needs your approval first" });
        add("APPROVAL", "Waiting for approval", ts, {
          status: "WAITING",
          tool: action?.tool ?? null,
          input_preview: preview(action?.description),
          result_preview: d.expires_at ? `Expires at ${d.expires_at}` : null,
        });
        break;
      }
      case "DECISION_RECORDED": {
        const approved = d.decision === "APPROVE";
        const wait = open("APPROVAL");
        if (wait) close(wait, ts, approved ? "DONE" : "REJECTED", { result_preview: approved ? "Approved" : "Rejected" });
        add("DECISION", approved ? "Approved" : "Rejected", ts, {
          status: approved ? "DONE" : "REJECTED",
          ended_at: ts,
          tool: action?.tool ?? null,
          result_preview: approved ? "You approved the action." : "You rejected the action. Nothing was changed.",
        });
        break;
      }
      case "APPROVAL_EXPIRED": {
        const wait = open("APPROVAL");
        if (wait) close(wait, ts, "REJECTED", { result_preview: "No decision within 15 minutes" });
        add("DECISION", "Expired", ts, {
          status: "REJECTED",
          ended_at: ts,
          tool: action?.tool ?? null,
          error: err("APPROVAL_EXPIRED", "The approval request expired after 15 minutes. Nothing was changed."),
        });
        break;
      }
      case "EXECUTION_STARTED":
        add("EXECUTION", `Run ${d.tool}`, ts, {
          tool: d.tool,
          input_preview: d.plan ? preview(`${d.plan.source} → ${d.plan.target}`) : null,
        });
        break;
      case "EXECUTION_FINISHED": {
        const node = open("EXECUTION");
        if (node) close(node, ts, "DONE", { result_preview: "The tool finished without an error" });
        break;
      }
      case "EXECUTION_ERROR": {
        const node = open("EXECUTION");
        if (node) close(node, ts, "FAILED", { error: err("EXECUTION_FAILED", d.message) });
        break;
      }
      case "RECOVERY": {
        for (const n of nodes.filter((x) => x.status === "RUNNING")) {
          close(n, ts, "FAILED", { error: err("INTERRUPTED", "Interrupted by a Core restart.") });
        }
        const checked = d.found === "EXECUTING" || d.found === "VERIFYING";
        add("RECOVERY", "Core restarted: recovery", ts, {
          status: "DONE",
          ended_at: ts,
          input_preview: `Found the task in ${d.found}`,
          result_preview: checked ? "Checked on disk. Not run again." : "Stopped. Send the message again.",
        });
        break;
      }
      case "VERIFICATION":
        add("VERIFICATION", "Verify on disk", ts, {
          status: d.verified ? "DONE" : "FAILED",
          ended_at: ts,
          tool: action?.tool ?? null,
          input_preview: d.target ? preview(`Is the file at ${d.target}?`) : null,
          result_preview: d.verified ? "Yes: the change is real" : "No: the file is not at the destination",
        });
        break;
      case "ERROR":
        for (const n of nodes.filter((x) => x.status === "RUNNING")) close(n, ts, "FAILED", { error: err(d.code, d.message) });
        break;
    }
  }

  const final = FINAL_STATUSES.includes(task.status);
  if (final) {
    for (const n of nodes.filter(isOpen)) {
      close(n, task.updated_at, "FAILED", { error: err("INTERNAL", "This step never finished.") });
    }
  }

  // Steps still ahead. A write task (it has an action) goes through approval, execution and verification.
  const reached = Math.max(0, ...nodes.map((n) => ORDER[n.kind] ?? 0));
  const ahead: TimelineNodeKind[] = action ? ["APPROVAL", "DECISION", "EXECUTION", "VERIFICATION"] : [];
  for (const kind of ahead) {
    if (ORDER[kind]! > reached) add(kind, PROJECTED_LABELS[kind]!, null, { status: "NOT_REACHED", tool: action?.tool ?? null });
  }

  if (!final) {
    add("RESULT", "Result", null, { status: "NOT_REACHED" });
  } else {
    const status: TimelineNodeStatus = task.status === "COMPLETED" ? "DONE" : task.status === "REJECTED" ? "REJECTED" : "FAILED";
    const label = task.status === "COMPLETED" ? "Completed" : task.status === "REJECTED" ? "Rejected" : "Failed";
    add("RESULT", label, task.updated_at, {
      status,
      ended_at: task.updated_at,
      tool: task.used_tool,
      result_preview: preview(task.result_message ?? task.error_message),
      error: task.error_code ? err(task.error_code, task.error_message ?? task.error_code) : null,
    });
  }

  return {
    contract_version: CONTRACT_VERSION,
    task_id: task.id,
    status: task.status,
    active: !final,
    created_at: task.created_at,
    updated_at: task.updated_at,
    nodes,
  };
}
