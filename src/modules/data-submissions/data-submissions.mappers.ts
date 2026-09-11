import type {
  Dataset,
  Institution,
  KpiDefinition,
  Obligation,
  Pillar,
  Submission,
  User,
} from "@prisma/client";
import {
  submissionWorkflowStatus,
  workflowStatus,
  type WorkflowStatus,
} from "@/modules/data-submissions/workflow-status";

const DAY_MS = 24 * 60 * 60 * 1000;

type DatasetWithRelations = Dataset & { pillar: Pillar; ownerInstitution: Institution | null };

function buildTemplate(dataset: Pick<Dataset, "id" | "templateFileName" | "templateVersion">) {
  return {
    id: dataset.id,
    version: String(dataset.templateVersion),
    fileName: dataset.templateFileName,
    downloadUrl: `/data-submissions/templates/${dataset.templateFileName}`,
  };
}

/**
 * Matches the Dataset shape in m300-frontend/src/api/schemas/data-
 * submissions/datasets.ts exactly - ownerInstitution is z.string().min(1)
 * there with no default, so "" (a null FK) would be a real contract
 * violation, not just an odd display value.
 */
export function toDatasetView(dataset: DatasetWithRelations) {
  return {
    id: dataset.id,
    name: dataset.name,
    purpose: dataset.purpose,
    pillar: dataset.pillar.slug,
    requiredDataPoints: dataset.requiredDataPoints,
    frequency: dataset.frequency,
    ownerInstitution: dataset.ownerInstitution?.name ?? "Unassigned",
    template: buildTemplate(dataset),
  };
}

function formatDueLabel(dueDate: Date): string {
  const days = Math.round((dueDate.getTime() - Date.now()) / DAY_MS);
  if (days > 0) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  const overdueDays = Math.abs(days);
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

type ObligationWithRelations = Obligation & {
  institution: Institution;
  dataset: DatasetWithRelations;
  focalPerson: User | null;
};

// Mirrors the mock's obligation-status/availableActions transitions
// (see docs/full-dashboard-backend-logic-audit.md's Data Submissions
// section and data-submissions.mappers research): no submission yet ->
// enter/upload/download; returned -> upload/download again (resubmit);
// anything else in flight -> view only. A fulfilled obligation
// (acceptedSubmissionId set) never reaches this function - see
// getObligations()'s query, which excludes those entirely.
const ACTIONS_UNSTARTED = ["enter-data", "upload-template", "download-template"];
const ACTIONS_RETURNED = ["upload-template", "download-template"];
const ACTIONS_IN_FLIGHT = ["view"];

/** Matches obligationSchema exactly (m300-frontend/src/api/schemas/data-submissions/obligations.ts). */
export function toObligationView(obligation: ObligationWithRelations, latestSubmission: Submission | null) {
  let status: WorkflowStatus;
  let availableActions: string[];

  if (!latestSubmission) {
    status = workflowStatus(obligation.dueDate.getTime() < Date.now() ? "overdue" : "due");
    availableActions = ACTIONS_UNSTARTED;
  } else if (latestSubmission.status === "RETURNED") {
    status = submissionWorkflowStatus(latestSubmission.status);
    availableActions = ACTIONS_RETURNED;
  } else {
    status = submissionWorkflowStatus(latestSubmission.status);
    availableActions = ACTIONS_IN_FLIGHT;
  }

  return {
    id: obligation.id,
    institution: obligation.institution.name,
    focalPerson: obligation.focalPerson?.fullName ?? "Not supplied",
    datasetId: obligation.datasetId,
    dataset: obligation.dataset.name,
    reportingPeriod: obligation.reportingPeriod,
    frequency: obligation.dataset.frequency,
    dueDate: obligation.dueDate.toISOString(),
    dueLabel: formatDueLabel(obligation.dueDate),
    status,
    template: buildTemplate(obligation.dataset),
    acceptedSubmissionId: obligation.acceptedSubmissionId,
    availableActions,
  };
}

const METHOD_CODE: Record<string, string> = { MANUAL_ENTRY: "manual-entry", UPLOAD: "template-upload" };
const METHOD_LABEL: Record<string, string> = { MANUAL_ENTRY: "Manual entry", UPLOAD: "Template upload" };

type SubmissionWithRelations = Submission & {
  institution: Institution;
  submittedBy: User;
  obligation: (Obligation & { dataset: Dataset }) | null;
};

/**
 * Matches SubmissionListItem exactly (m300-frontend/src/api/schemas/data-
 * submissions/submissions.ts). dataset/reportingPeriod/validationSummary
 * are all z.string().min(1) there - an empty string is a real contract
 * violation, not just an odd display value, so every fallback here must
 * be non-empty text, never "".
 */
export function toSubmissionListItem(submission: SubmissionWithRelations) {
  const submitted = submission.status !== "DRAFT";
  return {
    id: submission.id,
    institution: submission.institution.name,
    dataset: submission.obligation?.dataset.name ?? "Unlinked submission",
    reportingPeriod: submission.obligation?.reportingPeriod ?? "Unknown period",
    method: METHOD_CODE[submission.method] ?? submission.method,
    methodLabel: METHOD_LABEL[submission.method] ?? submission.method,
    version: submission.version,
    submittedBy: submission.submittedBy.fullName,
    submittedAt: submitted ? submission.createdAt.toISOString() : null,
    submittedAtLabel: submitted ? formatAgeLabel(submission.createdAt) : "Not yet submitted",
    status: submissionWorkflowStatus(submission.status),
    // Real validation-issue tracking is Phase 3 (validation queue/detail) -
    // honest placeholder text rather than a number this endpoint can't
    // actually back yet, but never "" (the schema requires min 1 char).
    validationSummary: "No validation issues recorded yet.",
    availableActions:
      submission.status === "PENDING" || submission.status === "UNDER_REVIEW" ? ["review"] : ["view"],
  };
}

function formatAgeLabel(date: Date): string {
  const days = Math.round((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Matches overdueItemSchema exactly (m300-frontend/src/api/schemas/data-submissions/compliance.ts). */
export function toOverdueItem(obligation: ObligationWithRelations) {
  const overdueDays = Math.max(0, Math.round((Date.now() - obligation.dueDate.getTime()) / DAY_MS));
  return {
    id: obligation.id,
    institution: obligation.institution.name,
    dataset: obligation.dataset.name,
    reportingPeriod: obligation.reportingPeriod,
    dueDate: obligation.dueDate.toISOString(),
    dueDateLabel: formatDueLabel(obligation.dueDate),
    overdueLabel: `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
    owner: obligation.focalPerson?.fullName ?? obligation.institution.name,
    status: workflowStatus("overdue"),
    availableActions: ACTIONS_UNSTARTED,
  };
}

type KpiWithPillar = KpiDefinition & { pillar: Pillar };

/**
 * Matches dataGapSchema's shape (m300-frontend/src/api/schemas/data-
 * submissions/compliance.ts). Deliberately the simplest defensible
 * definition given what's actually computable today: a KPI that has never
 * had an approved value published for it at all (no KpiValue row exists).
 * category/readinessTier/owner have no real backing data source yet in
 * this schema - placeholder text rather than inventing a fake taxonomy;
 * revisit once KPI Explorer's real shape (a separate module) exists.
 */
export function toDataGap(kpi: KpiWithPillar) {
  return {
    id: `gap-${kpi.id}`,
    kpiId: kpi.id,
    kpiName: kpi.name,
    pillar: kpi.pillar.name,
    institution: "Not supplied",
    reportingPeriod: "Not supplied",
    category: "No data ever received",
    readinessTier: "Not assessed",
    owner: "Unassigned",
    nextAction: "Assign a reporting obligation for this indicator.",
    status: null,
    availableActions: [] as string[],
  };
}
