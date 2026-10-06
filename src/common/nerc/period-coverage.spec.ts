import { addMonth, commonMonths, coverageNoteFor, quarterOfMonth } from "../../../prisma/lib/period-coverage";

const months = (...names: string[]) => new Set(names);

describe("coverageNoteFor", () => {
  it("returns nothing for a complete quarter", () => {
    expect(coverageNoteFor("q1-2026", months("January", "February", "March"))).toBeNull();
  });

  it("describes a quarter with the first two months as a range", () => {
    expect(coverageNoteFor("q2-2026", months("April", "May"))).toBe("Apr–May");
  });

  it("describes a single month by its name", () => {
    expect(coverageNoteFor("q2-2026", months("April"))).toBe("Apr");
  });

  it("lists months that are not adjacent instead of implying a range", () => {
    expect(coverageNoteFor("q3-2025", months("July", "September"))).toBe("Jul, Sep");
  });

  it("ignores months that belong to another quarter", () => {
    expect(coverageNoteFor("q2-2026", months("January", "April", "May"))).toBe("Apr–May");
  });

  it("returns nothing for an annual period or a period with no data", () => {
    expect(coverageNoteFor("2026", months("January"))).toBeNull();
    expect(coverageNoteFor("q2-2026", months())).toBeNull();
    expect(coverageNoteFor("q2-2026", undefined)).toBeNull();
  });
});

describe("commonMonths", () => {
  it("keeps only the months present in every source", () => {
    const revenue = new Map<string, Set<string>>();
    const energy = new Map<string, Set<string>>();
    for (const month of ["April", "May"]) addMonth(revenue, "q2-2026", month);
    for (const month of ["April", "May", "June"]) addMonth(energy, "q2-2026", month);
    expect([...(commonMonths([revenue, energy]).get("q2-2026") ?? [])]).toEqual(["April", "May"]);
  });

  it("drops a quarter that one source lacks entirely", () => {
    const a = new Map<string, Set<string>>();
    addMonth(a, "q2-2026", "April");
    expect(commonMonths([a, new Map()]).get("q2-2026")?.size).toBe(0);
  });
});

describe("quarterOfMonth", () => {
  it("maps month names to quarters", () => {
    expect(quarterOfMonth("March")).toBe(1);
    expect(quarterOfMonth("April")).toBe(2);
    expect(quarterOfMonth("Sept")).toBeNull();
  });
});
