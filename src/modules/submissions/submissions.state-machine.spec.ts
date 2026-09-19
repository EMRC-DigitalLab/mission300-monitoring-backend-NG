import { BadRequestException } from "@nestjs/common";
import { SubmissionStatus } from "@prisma/client";
import { assertValidTransition, TERMINAL_STATUSES } from "@/modules/submissions/submissions.state-machine";

describe("submissions state machine", () => {
  const statuses = Object.values(SubmissionStatus);
  const allowed = new Set([
    `${SubmissionStatus.DRAFT}:${SubmissionStatus.PENDING}`,
    `${SubmissionStatus.PENDING}:${SubmissionStatus.UNDER_REVIEW}`,
    `${SubmissionStatus.UNDER_REVIEW}:${SubmissionStatus.APPROVED}`,
    `${SubmissionStatus.UNDER_REVIEW}:${SubmissionStatus.PROVISIONALLY_APPROVED}`,
    `${SubmissionStatus.UNDER_REVIEW}:${SubmissionStatus.RETURNED}`,
    `${SubmissionStatus.UNDER_REVIEW}:${SubmissionStatus.REJECTED}`,
  ]);
  const transitionCases = statuses.flatMap((from) =>
    statuses.map((to) => ({ from, to, isAllowed: allowed.has(`${from}:${to}`) })),
  );

  it.each(transitionCases)("validates $from -> $to", ({ from, to, isAllowed }) => {
    if (isAllowed) {
      expect(() => assertValidTransition(from, to)).not.toThrow();
      return;
    }

    expect(() => assertValidTransition(from, to)).toThrow(BadRequestException);
    expect(() => assertValidTransition(from, to)).toThrow(`Cannot move submission from ${from} to ${to}`);
  });

  it("exports every terminal decision status", () => {
    expect(TERMINAL_STATUSES).toEqual([
      SubmissionStatus.APPROVED,
      SubmissionStatus.PROVISIONALLY_APPROVED,
      SubmissionStatus.REJECTED,
    ]);
  });
});
