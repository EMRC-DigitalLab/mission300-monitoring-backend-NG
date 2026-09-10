import { matches } from "@/notifications/webhooks/webhooks.service";

describe("webhook event pattern matching", () => {
  it("matches an exact event name", () => {
    expect(matches("submission.decision_recorded", "submission.decision_recorded")).toBe(true);
  });

  it("rejects a different exact event name", () => {
    expect(matches("submission.decision_recorded", "user.invited")).toBe(false);
  });

  it("matches a prefix wildcard", () => {
    expect(matches("submission.*", "submission.decision_recorded")).toBe(true);
  });

  it("rejects a wildcard for a different prefix", () => {
    expect(matches("submission.*", "user.invited")).toBe(false);
  });

  it("does not treat a bare wildcard segment as a substring match", () => {
    expect(matches("sub.*", "submission.decision_recorded")).toBe(false);
  });
});
