// Central catalogue of every email the system sends. Add a new template by
// creating one file here (using layout.ts's renderLayout/renderButton) and
// re-exporting it below - nothing else needs to know the file exists.
export { accountInvitedEmail } from "@/notifications/email/templates/account-invited";
export { passwordResetEmail } from "@/notifications/email/templates/password-reset";
export { submissionDecisionEmail } from "@/notifications/email/templates/submission-decision";
export { reportReadyEmail } from "@/notifications/email/templates/report-ready";
export type { EmailTemplate } from "@/notifications/email/templates/layout";
