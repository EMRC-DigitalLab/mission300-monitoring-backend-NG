import type { SubmissionStatus } from "@prisma/client";

// Matches workflowStatusSchema/workflowStatusCodeSchema exactly
// (m300-frontend/src/api/schemas/data-submissions/common.ts) - every
// status in this module is this object shape, never a bare string.
export type WorkflowTone = "neutral" | "info" | "warning" | "danger" | "success";

export interface WorkflowStatus {
  code: string;
  label: string;
  tone: WorkflowTone;
}

const STATUS_DEFS: Record<string, { label: string; tone: WorkflowTone }> = {
  due: { label: "Due", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  "pending-review": { label: "Pending review", tone: "info" },
  returned: { label: "Returned", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
  provisional: { label: "Provisionally approved", tone: "success" },
  approved: { label: "Approved", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  missing: { label: "Missing", tone: "warning" },
  // Automated-check states (validationQueueItemSchema.automatedCheck),
  // distinct from submission states above.
  pass: { label: "Pass", tone: "success" },
  fail: { label: "Fail", tone: "danger" },
  pending: { label: "Pending", tone: "neutral" },
};

export function workflowStatus(code: string): WorkflowStatus {
  const def = STATUS_DEFS[code] ?? { label: code, tone: "neutral" as WorkflowTone };
  return { code, label: def.label, tone: def.tone };
}

// PENDING and UNDER_REVIEW both collapse to the real contract's single
// "pending-review" state - the backend's extra split has no equivalent
// there (see submissions.controller.ts's now-unused start-review route).
const SUBMISSION_STATUS_CODE: Record<SubmissionStatus, string> = {
  DRAFT: "draft",
  PENDING: "pending-review",
  UNDER_REVIEW: "pending-review",
  APPROVED: "approved",
  PROVISIONALLY_APPROVED: "provisional",
  RETURNED: "returned",
  REJECTED: "rejected",
};

export function submissionWorkflowStatus(status: SubmissionStatus): WorkflowStatus {
  return workflowStatus(SUBMISSION_STATUS_CODE[status]);
}
