/**
 * Executive Overview is a pure read-composition layer: Sections A-C read
 * real KpiDefinition/KpiValue rows (the same KPI Explorer profile shape
 * KPI Explorer itself returns - see toKpiProfile() in kpi-explorer.
 * mappers.ts, reused directly here), and Section D reads real Programme/
 * Project/Bottleneck rows. Nothing is a separate, hand-typed copy of that
 * data - approving a submission that publishes a KPI value, or changing a
 * project/bottleneck status, changes what this endpoint returns on the
 * next request, exactly like the real frontend mock's own header comment
 * on buildExecutiveOverview() describes.
 */

/** Matches sourceTagSchema (common.ts). KPI Explorer's deriveValidationStatus
 * never actually produces "public-source" yet (no submission path creates
 * one - see that module's own comment), but the mapping is included for
 * completeness against the full real vocabulary. */
export function toSourceTag(validationStatus: string): string {
  switch (validationStatus) {
    case "confirmed":
      return "live";
    case "public-source":
      return "public-source";
    case "provisional":
      return "indicative";
    case "requires-validation":
    case "future":
    default:
      return "requires-validation";
  }
}

/** Matches dataConfidenceSchema (common.ts) - same 3-state derivation KPI Explorer's own deriveConfidence() uses. */
export function toConfidence(validationStatus: string): string {
  if (validationStatus === "confirmed") return "confirmed";
  if (validationStatus === "future") return "future-gap";
  return "requires-validation";
}

/**
 * Appends the target's deadline to its label unless the label already names
 * that year - matches the frontend mock's own withTargetDate() exactly. A
 * target without a date ("100% market remittance compliance") does not say
 * what is actually being committed to; the date is held structurally on the
 * KPI profile (targetDate), this only formats it into the display label.
 */
export function withTargetDate(label: string, targetDate: string | null): string {
  if (!targetDate) return label;
  const year = targetDate.match(/20\d\d/)?.[0];
  if (year && label.includes(year)) return label;
  return `${label} — by ${targetDate}`;
}

export const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * Reconciles Bottlenecks' real 4-tier severity (critical/high/medium/low)
 * against this section's own 4-tag exception schema (critical/regulatory/
 * delayed/blocked, which describes the KIND of exception as much as its
 * severity) - matches the frontend mock's own mapBottleneckSeverity()
 * exactly, including the precedence order (blocked status and critical
 * severity are the most specific true facts, checked first).
 */
export function mapBottleneckExceptionSeverity(row: {
  status: string;
  severity: string;
  category: string;
}): "critical" | "regulatory" | "delayed" | "blocked" {
  if (row.status === "BLOCKED") return "blocked";
  if (row.severity === "CRITICAL") return "critical";
  if (row.category === "REGULATORY_APPROVAL") return "regulatory";
  return "delayed";
}
