import {
  renderLayout,
  renderButton,
  escapeHtml,
  type EmailBrand,
  type EmailTemplate,
} from "@/notifications/email/templates/layout";

/** Sent to the submitter right after an upload is accepted - confirms receipt, not a decision. */
export function submissionReceivedEmail(
  params: { institutionName: string; datasetName: string; reportingPeriod: string; submissionsUrl: string },
  brand: EmailBrand,
): EmailTemplate {
  const subject = `Submission received: ${params.datasetName} (${params.reportingPeriod})`;
  const html = renderLayout(
    subject,
    `<p style="margin: 0 0 16px;">Your submission for <strong>${escapeHtml(params.institutionName)}</strong> has been received and passed initial validation.</p>
     <p style="margin: 0 0 4px; font-weight: 600;">${escapeHtml(params.datasetName)}</p>
     <p style="margin: 0 0 20px; color: #667085;">${escapeHtml(params.reportingPeriod)}</p>
     <p style="margin: 0 0 16px;">It's now pending review - you'll get another email once a decision is recorded.</p>
     ${renderButton("View your submissions", params.submissionsUrl, brand)}`,
    brand,
    "Your submission is pending review",
  );
  return { subject, html };
}
