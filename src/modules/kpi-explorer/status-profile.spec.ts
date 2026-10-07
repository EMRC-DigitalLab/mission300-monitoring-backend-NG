import { toKpiProfile } from "@/modules/kpi-explorer/kpi-explorer.mappers";

const kpi = (unit: string) =>
  ({
    code: "M300-X-001",
    name: "Test indicator",
    unit,
    pillar: { slug: "generation-network" },
    direction: "HIGHER_IS_BETTER",
    readiness: "CORE",
    baseline: null,
    target: null,
    targetBasis: null,
    targetPoints: [],
    externalStandardAlignment: null,
    sourceInstitutions: [],
    canonicalKpi: null,
    aliases: [],
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  }) as never;

const point = (id: string, period: string, value: number) =>
  ({
    id,
    period,
    value,
    coverageNote: null,
    approvedAt: new Date("2026-09-30T00:00:00.000Z"),
    sourceSubmissionItemId: `item-${id}`,
    sourceSubmissionItem: { submissionId: `sub-${id}`, submission: { status: "APPROVED", sourceReference: "file" } },
  }) as never;

describe("toKpiProfile for a status indicator", () => {
  it.each([
    [0, "Not yet achieved"],
    [1, "In progress"],
    [2, "Achieved"],
  ])("shows %s as %s", (value, label) => {
    const profile = toKpiProfile(kpi("status"), [point("a", "q3-2026", value)]);
    expect(profile.currentLabel).toBe(label);
    expect(profile.history[0].valueLabel).toBe(label);
  });

  it("gives no trend or variance, since a status has no direction of travel", () => {
    const profile = toKpiProfile(kpi("Yes/No"), [point("a", "q2-2026", 0), point("b", "q3-2026", 2)]);
    expect(profile.trend).toBeUndefined();
    expect(profile.varianceLabel).toBe("No variance available.");
  });

  it("falls back to no data for a number that is not a status level", () => {
    expect(toKpiProfile(kpi("status"), [point("a", "q3-2026", 9)]).currentLabel).toBe("No data yet");
  });

  it("leaves a numeric indicator exactly as before", () => {
    const profile = toKpiProfile(kpi("MW"), [point("a", "q2-2026", 4000), point("b", "q3-2026", 4285)]);
    expect(profile.currentLabel).toBe("4285 MW");
    expect(profile.history[1].valueLabel).toBeNull();
    expect(profile.trend).toBeDefined();
  });

  it("reports no label for any indicator with no value", () => {
    expect(toKpiProfile(kpi("status"), []).currentLabel).toBe("No data yet");
  });
});
