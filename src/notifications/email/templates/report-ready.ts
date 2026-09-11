import {
  renderLayout,
  escapeHtml,
  type EmailBrand,
  type EmailTemplate,
} from "@/notifications/email/templates/layout";

export function reportReadyEmail(params: { reportType: string }, brand: EmailBrand): EmailTemplate {
  const subject = "Your report is ready";
  const html = renderLayout(
    subject,
    `<p style="margin: 0;">Your <strong>${escapeHtml(params.reportType)}</strong> report has finished generating and is ready to download.</p>`,
    brand,
    "Your report is ready to download",
  );
  return { subject, html };
}
