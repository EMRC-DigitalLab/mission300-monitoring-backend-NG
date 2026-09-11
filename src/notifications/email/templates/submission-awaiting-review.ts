import {
  renderLayout,
  renderButton,
  escapeHtml,
  type EmailBrand,
  type EmailTemplate,
} from "@/notifications/email/templates/layout";

/**
 * Sent to every DATA_REVIEWER/VALIDATOR - there's no per-submission
 * reviewer assignment yet (that's Phase 3), so the whole reviewer pool
 * hears about a new item rather than nobody at all.
 */
export function submissionAwaitingReviewEmail(
  params: {
    institutionName: string;
    datasetName: string;
    reportingPeriod: string;
    submittedByName: string;
    validationUrl: string;
  },
  brand: EmailBrand,
): EmailTemplate {
  const subject = `New submission awaiting review: ${params.datasetName} (${params.reportingPeriod})`;
  const html = renderLayout(
    subject,
    `<p style="margin: 0 0 16px;"><strong>${escapeHtml(params.submittedByName)}</strong> at <strong>${escapeHtml(params.institutionName)}</strong> submitted data that's ready for review.</p>
     <p style="margin: 0 0 4px; font-weight: 600;">${escapeHtml(params.datasetName)}</p>
     <p style="margin: 0 0 20px; color: #667085;">${escapeHtml(params.reportingPeriod)}</p>
     ${renderButton("Review this submission", params.validationUrl, brand)}`,
    brand,
    "A new submission is awaiting your review",
  );
  return { subject, html };
}
