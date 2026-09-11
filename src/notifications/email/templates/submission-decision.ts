import {
  renderLayout,
  renderStatusBadge,
  escapeHtml,
  type BadgeTone,
  type EmailTemplate,
} from "@/notifications/email/templates/layout";

// Mirrors ReviewDecisionType in prisma/schema.prisma. Kept as a plain string
// union (rather than importing the Prisma enum) so this template has no
// dependency on the generated client.
const decisionDisplay: Record<string, { label: string; tone: BadgeTone }> = {
  APPROVE: { label: "Approved", tone: "positive" },
  PROVISIONALLY_APPROVE: { label: "Provisionally approved", tone: "warning" },
  RETURN_FOR_CORRECTION: { label: "Returned for correction", tone: "warning" },
  REJECT: { label: "Rejected", tone: "negative" },
};

export function submissionDecisionEmail(params: {
  institutionName: string;
  decision: string;
  comment: string;
}): EmailTemplate {
  const { label, tone } = decisionDisplay[params.decision] ?? {
    label: params.decision,
    tone: "neutral" as BadgeTone,
  };
  const subject = `Submission decision recorded: ${label}`;
  const html = renderLayout(
    subject,
    `<p style="margin: 0 0 16px;">A data submission from <strong>${escapeHtml(params.institutionName)}</strong> was reviewed.</p>
     <p style="margin: 0 0 20px;">${renderStatusBadge(label, tone)}</p>
     <p style="margin: 0 0 4px; font-weight: 600;">Reviewer comment</p>
     <p style="margin: 0; color: #667085;">${escapeHtml(params.comment)}</p>`,
    `Submission decision recorded: ${label}`,
  );
  return { subject, html };
}
