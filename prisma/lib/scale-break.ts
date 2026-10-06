export interface ScaleBreak {
  period: string;
  previousPeriod: string;
  previousTotal: number;
  total: number;
  ratio: number;
}

const QUARTER_PERIOD = /^q([1-4])-(\d{4})$/;

function quarterOrder(period: string): number | null {
  const match = QUARTER_PERIOD.exec(period);
  return match ? Number(match[2]) * 4 + Number(match[1]) : null;
}

export function findScaleBreaks(totalsByPeriod: Map<string, number>, factor = 5): ScaleBreak[] {
  const ordered = [...totalsByPeriod.entries()]
    .map(([period, total]) => ({ period, total, order: quarterOrder(period) }))
    .filter((entry): entry is { period: string; total: number; order: number } => entry.order !== null)
    .sort((a, b) => a.order - b.order);

  const breaks: ScaleBreak[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.total <= 0 || current.total <= 0) continue;
    const ratio = previous.total / current.total;
    if (ratio > factor) {
      breaks.push({
        period: current.period,
        previousPeriod: previous.period,
        previousTotal: previous.total,
        total: current.total,
        ratio,
      });
    }
  }
  return breaks;
}

export function parseAcceptedScaleBreaks(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((period) => period.trim().toLowerCase())
      .filter((period) => period.length > 0),
  );
}
