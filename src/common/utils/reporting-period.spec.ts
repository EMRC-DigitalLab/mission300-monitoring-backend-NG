import { compareReportingValues, reportingPeriodKey } from "./reporting-period";

describe("reporting chronology", () => {
  it("keeps a late correction to an old period behind a newer observation", () => {
    const oldCorrection = { period: "2024-Q4", approvedAt: new Date("2026-09-01") };
    const current = { period: "2026-Q2", approvedAt: new Date("2026-07-01") };
    expect(compareReportingValues(oldCorrection, current)).toBeLessThan(0);
    expect([current, oldCorrection].sort(compareReportingValues).at(-1)).toBe(current);
  });

  it("uses the latest approval for revisions within one period", () => {
    const first = { period: "q2-2026", approvedAt: new Date("2026-07-01") };
    const revision = { period: "q2-2026", approvedAt: new Date("2026-08-01") };
    expect(compareReportingValues(first, revision)).toBeLessThan(0);
  });

  it("orders monthly, quarterly and annual periods", () => {
    expect(reportingPeriodKey("2026-02")).toBeLessThan(reportingPeriodKey("Q2-2026")!);
    expect(reportingPeriodKey("2026-Q2")).toBe(reportingPeriodKey("Q2-2026"));
    expect(reportingPeriodKey("Q2-2026")).toBeLessThan(reportingPeriodKey("2026")!);
  });
});
