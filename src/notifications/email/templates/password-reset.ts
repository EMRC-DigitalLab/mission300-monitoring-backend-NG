import {
  renderLayout,
  renderButton,
  escapeHtml,
  type EmailTemplate,
} from "@/notifications/email/templates/layout";

export function passwordResetEmail(params: { fullName: string; resetUrl: string }): EmailTemplate {
  const subject = "Reset your M300 Dashboard password";
  const html = renderLayout(
    subject,
    `<p style="margin: 0 0 16px;">Hi ${escapeHtml(params.fullName)},</p>
     <p style="margin: 0 0 16px;">We received a request to reset your password. If this wasn't you, you can safely ignore this email.</p>
     ${renderButton("Reset password", params.resetUrl)}
     <p style="font-size: 12px; color: #667085; margin: 0;">This link expires in 1 hour.</p>`,
    "Reset your M300 Dashboard password",
  );
  return { subject, html };
}
