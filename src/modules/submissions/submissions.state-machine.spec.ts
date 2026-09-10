import { SubmissionStatus } from "@prisma/client";
import { assertValidTransition } from "@/modules/submissions/submissions.state-machine";

describe("submissions state machine", () => {
  it("allows DRAFT -> PENDING", () => {
    expect(() => assertValidTransition(SubmissionStatus.DRAFT, SubmissionStatus.PENDING)).not.toThrow();
  });

  it("allows UNDER_REVIEW -> APPROVED", () => {
    expect(() =>
      assertValidTransition(SubmissionStatus.UNDER_REVIEW, SubmissionStatus.APPROVED),
    ).not.toThrow();
  });

  it("rejects skipping straight from DRAFT to APPROVED", () => {
    expect(() => assertValidTransition(SubmissionStatus.DRAFT, SubmissionStatus.APPROVED)).toThrow();
  });

  it("rejects reopening a RETURNED submission in place", () => {
    expect(() => assertValidTransition(SubmissionStatus.RETURNED, SubmissionStatus.PENDING)).toThrow();
  });

  it("rejects any transition out of a terminal APPROVED status", () => {
    expect(() => assertValidTransition(SubmissionStatus.APPROVED, SubmissionStatus.REJECTED)).toThrow();
  });
});
