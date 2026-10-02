import type { TaskStatus } from "@ahmed/contract";

/**
 * Every allowed transition, explicitly. Anything not listed throws.
 *
 * Read task:  RECEIVED -> PROCESSING -> COMPLETED
 * Write task: RECEIVED -> PROCESSING -> WAITING_FOR_APPROVAL -> APPROVED -> EXECUTING
 *             -> VERIFYING -> COMPLETED | FAILED,   or WAITING_FOR_APPROVAL -> REJECTED
 * RECEIVED/PROCESSING -> FAILED covers model/tool errors and tasks interrupted by a restart.
 */
export const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  RECEIVED: ["PROCESSING", "FAILED"],
  PROCESSING: ["COMPLETED", "WAITING_FOR_APPROVAL", "FAILED"],
  WAITING_FOR_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTING"],
  EXECUTING: ["VERIFYING"],
  VERIFYING: ["COMPLETED", "FAILED"],
  REJECTED: [],
  COMPLETED: [],
  FAILED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: TaskStatus,
    readonly to: TaskStatus,
  ) {
    super(`Invalid task transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
