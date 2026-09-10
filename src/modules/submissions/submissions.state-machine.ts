import { SubmissionStatus } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";

/**
 * Explicit transition table. The service layer MUST check this before
 * writing a new status - never let a controller or the UI be the only thing
 * enforcing valid submission states.
 */
const ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  [SubmissionStatus.DRAFT]: [SubmissionStatus.PENDING],
  [SubmissionStatus.PENDING]: [SubmissionStatus.UNDER_REVIEW],
  [SubmissionStatus.UNDER_REVIEW]: [
    SubmissionStatus.APPROVED,
    SubmissionStatus.PROVISIONALLY_APPROVED,
    SubmissionStatus.RETURNED,
    SubmissionStatus.REJECTED,
  ],
  [SubmissionStatus.RETURNED]: [], // a returned submission is corrected via a NEW version, not reopened
  [SubmissionStatus.APPROVED]: [],
  [SubmissionStatus.PROVISIONALLY_APPROVED]: [],
  [SubmissionStatus.REJECTED]: [],
};

export function assertValidTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`Cannot move submission from ${from} to ${to}`);
  }
}

export const TERMINAL_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.APPROVED,
  SubmissionStatus.PROVISIONALLY_APPROVED,
  SubmissionStatus.REJECTED,
];
