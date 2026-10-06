export interface MeteringRow {
  disco: string;
  customerType: string;
  date: Date;
  count: number;
}

export interface CustomerStock {
  metered: number;
  unmetered: number;
}

export interface QuarterEndStocks {
  snapshotDate: Date;
  byDisco: Map<string, CustomerStock>;
}

export function quarterPeriodOf(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `q${quarter}-${date.getUTCFullYear()}`;
}

export function quarterEndCustomerStocks(rows: MeteringRow[]): Map<string, QuarterEndStocks> {
  const latestByPeriod = new Map<string, number>();
  for (const row of rows) {
    const period = quarterPeriodOf(row.date);
    const time = row.date.getTime();
    const latest = latestByPeriod.get(period);
    if (latest === undefined || time > latest) latestByPeriod.set(period, time);
  }

  const result = new Map<string, QuarterEndStocks>();
  for (const row of rows) {
    const period = quarterPeriodOf(row.date);
    if (row.date.getTime() !== latestByPeriod.get(period)) continue;

    const entry = result.get(period) ?? { snapshotDate: row.date, byDisco: new Map<string, CustomerStock>() };
    const stock = entry.byDisco.get(row.disco) ?? { metered: 0, unmetered: 0 };
    if (row.customerType === "Metered Customer") stock.metered += row.count;
    else if (row.customerType === "Unmetered Customer") stock.unmetered += row.count;
    entry.byDisco.set(row.disco, stock);
    result.set(period, entry);
  }
  return result;
}
