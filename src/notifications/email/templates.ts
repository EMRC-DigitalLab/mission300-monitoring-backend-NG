// Plain, dependency-free HTML strings - no templating engine needed for
// this few, this simple. Add a real engine only if this grows unwieldy.

function wrapper(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
      <h2 style="margin-bottom: 8px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
        M300 Nigeria Energy Compact Dashboard
      </p>
    </div>
  `;
}

export function submissionDecisionEmail(params: {
  institutionName: string;
  decision: string;
  comment: string;
}): { subject: string; html: string } {
  const subject = `Submission decision recorded: ${params.decision}`;
  const html = wrapper(
    subject,
    `<p>A data submission from <strong>${params.institutionName}</strong> was reviewed.</p>
     <p><strong>Decision:</strong> ${params.decision}</p>
     <p><strong>Reviewer comment:</strong> ${params.comment}</p>`,
  );
  return { subject, html };
}

export function userInvitedEmail(params: { fullName: string }): { subject: string; html: string } {
  const subject = "You've been invited to the M300 Dashboard";
  const html = wrapper(
    subject,
    `<p>Hi ${params.fullName},</p>
     <p>An account has been created for you on the M300 Compact Dashboard. Contact your administrator to set your password.</p>`,
  );
  return { subject, html };
}

export function reportReadyEmail(params: { reportType: string }): { subject: string; html: string } {
  const subject = "Your report is ready";
  const html = wrapper(
    subject,
    `<p>Your <strong>${params.reportType}</strong> report has finished generating and is ready to download.</p>`,
  );
  return { subject, html };
}
