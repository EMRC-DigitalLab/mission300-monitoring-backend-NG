import { KPI_LINKS, planCopy, validateKpiLinks, type SourceValue } from "../../../prisma/lib/kpi-links";

const source = (period: string, value: number, coverageNote: string | null = null): SourceValue => ({
  period,
  value,
  coverageNote,
  institutionId: "inst",
  approvedAt: new Date("2026-09-30T00:00:00.000Z"),
});

describe("KPI_LINKS", () => {
  it("is internally consistent", () => {
    expect(validateKpiLinks(KPI_LINKS)).toEqual([]);
  });

  it("links the nine matrix KPIs to the indicators that record the same measurement", () => {
    expect(KPI_LINKS).toHaveLength(9);
    expect(KPI_LINKS).toContainEqual({ canonical: "M300-P2-006", alias: "M300-P2-030" });
    expect(KPI_LINKS).toContainEqual({ canonical: "M300-P4-001", alias: "M300-P4-009" });
    expect(KPI_LINKS).toContainEqual({ canonical: "M300-P2-008", alias: "M300-P2-025" });
    expect(KPI_LINKS).toContainEqual({ canonical: "M300-P2-002", alias: "M300-P2-026" });
    expect(KPI_LINKS).toContainEqual({ canonical: "M300-P1-003", alias: "M300-P1-016" });
  });
});

describe("validateKpiLinks", () => {
  it("rejects a KPI linked to itself", () => {
    expect(validateKpiLinks([{ canonical: "A", alias: "A" }])).toHaveLength(1);
  });

  it("rejects two aliases that point at one canonical KPI", () => {
    expect(
      validateKpiLinks([
        { canonical: "A", alias: "B" },
        { canonical: "A", alias: "C" },
      ]),
    ).toHaveLength(1);
  });

  it("rejects an alias that is also a canonical KPI", () => {
    expect(
      validateKpiLinks([
        { canonical: "A", alias: "B" },
        { canonical: "B", alias: "C" },
      ]),
    ).toHaveLength(1);
  });
});

describe("planCopy", () => {
  it("creates values the canonical KPI does not have yet", () => {
    const plan = planCopy([source("q3-2026", 554)], []);
    expect(plan.create.map((value) => value.period)).toEqual(["q3-2026"]);
    expect(plan.update).toEqual([]);
  });

  it("updates a value that has drifted from the source", () => {
    const plan = planCopy([source("q3-2026", 560)], [{ period: "q3-2026", value: 554, coverageNote: null }]);
    expect(plan.update.map((value) => value.value)).toEqual([560]);
    expect(plan.create).toEqual([]);
  });

  it("updates a value whose coverage note changed", () => {
    const plan = planCopy([source("q2-2026", 10, "Apr–May")], [{ period: "q2-2026", value: 10, coverageNote: null }]);
    expect(plan.update).toHaveLength(1);
  });

  it("leaves an identical value alone, so a re-run changes nothing", () => {
    const plan = planCopy([source("q3-2026", 554)], [{ period: "q3-2026", value: 554, coverageNote: null }]);
    expect(plan).toEqual({ create: [], update: [], unchanged: 1 });
  });

  it("never touches a period the source does not have", () => {
    const plan = planCopy([source("q3-2026", 554)], [{ period: "q1-2020", value: 1, coverageNote: null }]);
    expect(plan.create.map((value) => value.period)).toEqual(["q3-2026"]);
    expect(plan.update).toEqual([]);
  });
});
