import {
  quarterEndCustomerStocks,
  quarterPeriodOf,
  type MeteringRow,
} from "../../../prisma/lib/nerc-customer-stocks";
import { findScaleBreaks, parseAcceptedScaleBreaks } from "../../../prisma/lib/scale-break";

const row = (
  disco: string,
  type: "Metered Customer" | "Unmetered Customer",
  date: string,
  count: number,
): MeteringRow => ({
  disco,
  customerType: type,
  date: new Date(`${date}T00:00:00.000Z`),
  count,
});

describe("quarterPeriodOf", () => {
  it("uses the UTC month so a month-end date never slips into the previous quarter", () => {
    expect(quarterPeriodOf(new Date("2025-09-30T00:00:00.000Z"))).toBe("q3-2025");
    expect(quarterPeriodOf(new Date("2025-12-31T00:00:00.000Z"))).toBe("q4-2025");
    expect(quarterPeriodOf(new Date("2026-04-30T00:00:00.000Z"))).toBe("q2-2026");
  });
});

describe("quarterEndCustomerStocks", () => {
  it("takes the latest month in the quarter instead of adding the months together", () => {
    const rows = [
      row("Abuja", "Metered Customer", "2025-10-31", 100),
      row("Abuja", "Metered Customer", "2025-11-30", 110),
      row("Abuja", "Metered Customer", "2025-12-31", 120),
      row("Abuja", "Unmetered Customer", "2025-10-31", 50),
      row("Abuja", "Unmetered Customer", "2025-12-31", 40),
    ];
    const stocks = quarterEndCustomerStocks(rows).get("q4-2025");
    expect(stocks?.byDisco.get("Abuja")).toEqual({ metered: 120, unmetered: 40 });
    expect(stocks?.snapshotDate.toISOString()).toBe("2025-12-31T00:00:00.000Z");
  });

  it("keeps a quarter that has a single snapshot unchanged", () => {
    const rows = [
      row("Eko", "Metered Customer", "2025-06-30", 700),
      row("Eko", "Unmetered Customer", "2025-06-30", 300),
    ];
    expect(quarterEndCustomerStocks(rows).get("q2-2025")?.byDisco.get("Eko")).toEqual({
      metered: 700,
      unmetered: 300,
    });
  });

  it("treats a quarter still in progress as of its latest month", () => {
    const rows = [
      row("Eko", "Metered Customer", "2026-04-30", 900),
      row("Eko", "Unmetered Customer", "2026-04-30", 100),
    ];
    const stocks = quarterEndCustomerStocks(rows).get("q2-2026");
    expect(stocks?.snapshotDate.toISOString()).toBe("2026-04-30T00:00:00.000Z");
    expect(stocks?.byDisco.get("Eko")).toEqual({ metered: 900, unmetered: 100 });
  });

  it("does not carry a DisCo that stopped reporting into a later quarter-end", () => {
    const rows = [
      row("Aba", "Metered Customer", "2025-10-31", 140927),
      row("Aba", "Unmetered Customer", "2025-10-31", 39279),
      row("Eko", "Metered Customer", "2025-10-31", 1000),
      row("Eko", "Metered Customer", "2025-12-31", 1200),
      row("Eko", "Unmetered Customer", "2025-12-31", 800),
    ];
    const stocks = quarterEndCustomerStocks(rows).get("q4-2025");
    expect(stocks?.byDisco.has("Aba")).toBe(false);
    expect(stocks?.byDisco.get("Eko")).toEqual({ metered: 1200, unmetered: 800 });
  });

  it("separates quarters from different years", () => {
    const rows = [
      row("Eko", "Metered Customer", "2025-03-31", 1),
      row("Eko", "Metered Customer", "2026-03-31", 2),
    ];
    const result = quarterEndCustomerStocks(rows);
    expect(result.get("q1-2025")?.byDisco.get("Eko")?.metered).toBe(1);
    expect(result.get("q1-2026")?.byDisco.get("Eko")?.metered).toBe(2);
  });

  it("reproduces the NERC-confirmed December 2025 national totals from the monthly snapshots", () => {
    const months: [string, number, number][] = [
      ["2025-10-31", 6768386, 5302632],
      ["2025-11-30", 6857028, 5271583],
      ["2025-12-31", 6966584, 5196828],
    ];
    const rows = months.flatMap(([date, metered, unmetered]) => [
      row("All", "Metered Customer", date, metered),
      row("All", "Unmetered Customer", date, unmetered),
    ]);
    const stock = quarterEndCustomerStocks(rows).get("q4-2025")?.byDisco.get("All");
    expect(stock).toEqual({ metered: 6966584, unmetered: 5196828 });
    expect((stock?.metered ?? 0) + (stock?.unmetered ?? 0)).toBe(12163412);
  });
});

describe("findScaleBreaks", () => {
  it("flags the roughly nine-fold drop in DisCo energy received between Q2 and Q3 2025", () => {
    const totals = new Map([
      ["q1-2025", 8263],
      ["q2-2025", 7905],
      ["q3-2025", 871],
      ["q4-2025", 957],
    ]);
    const breaks = findScaleBreaks(totals);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ period: "q3-2025", previousPeriod: "q2-2025" });
    expect(breaks[0].ratio).toBeGreaterThan(9);
  });

  it("does not flag an ordinary fall or a partial quarter", () => {
    const totals = new Map([
      ["q1-2026", 9000],
      ["q2-2026", 3000],
    ]);
    expect(findScaleBreaks(totals)).toEqual([]);
  });

  it("orders periods chronologically regardless of insertion order", () => {
    const totals = new Map([
      ["q3-2025", 871],
      ["q2-2025", 7905],
    ]);
    expect(findScaleBreaks(totals).map((entry) => entry.period)).toEqual(["q3-2025"]);
  });

  it("ignores empty quarters and non-quarter periods", () => {
    const totals = new Map([
      ["q1-2025", 8000],
      ["2025", 1],
      ["q2-2025", 0],
    ]);
    expect(findScaleBreaks(totals)).toEqual([]);
  });

  it("does not flag a rise in scale", () => {
    const totals = new Map([
      ["q1-2025", 100],
      ["q2-2025", 5000],
    ]);
    expect(findScaleBreaks(totals)).toEqual([]);
  });
});

describe("parseAcceptedScaleBreaks", () => {
  it("normalises case and whitespace", () => {
    expect([...parseAcceptedScaleBreaks(" Q3-2025 , q4-2025 ")]).toEqual(["q3-2025", "q4-2025"]);
  });

  it("returns an empty set when nothing is acknowledged", () => {
    expect(parseAcceptedScaleBreaks(undefined).size).toBe(0);
    expect(parseAcceptedScaleBreaks("").size).toBe(0);
  });
});
