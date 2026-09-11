import { renderLayout, escapeHtml, type EmailTemplate } from "@/notifications/email/templates/layout";

export function reportReadyEmail(params: { reportType: string }): EmailTemplate {
  const subject = "Your report is ready";
  const html = renderLayout(
    subject,
    `<p style="margin: 0;">Your <strong>${escapeHtml(params.reportType)}</strong> report has finished generating and is ready to download.</p>`,
    "Your report is ready to download",
  );
  return { subject, html };
}
