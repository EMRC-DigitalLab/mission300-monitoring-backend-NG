export interface KpiLink {
  canonical: string;
  alias: string;
}

export const KPI_LINKS: KpiLink[] = [
  { canonical: "M300-P2-002", alias: "M300-P2-026" },
  { canonical: "M300-P2-004", alias: "M300-P2-031" },
  { canonical: "M300-P2-005", alias: "M300-P2-027" },
  { canonical: "M300-P2-013", alias: "M300-P2-033" },
  { canonical: "M300-P2-015", alias: "M300-P2-035" },
  { canonical: "M300-P1-003", alias: "M300-P1-016" },
];

export interface LinkedValue {
  period: string;
  value: number;
  coverageNote: string | null;
}

export interface SourceValue extends LinkedValue {
  institutionId: string | null;
  approvedAt: Date;
}

export interface CopyPlan {
  create: SourceValue[];
  update: SourceValue[];
  unchanged: number;
}

export function validateKpiLinks(links: KpiLink[]): string[] {
  const problems: string[] = [];
  const canonicals = new Set<string>();
  const aliases = new Set<string>();

  for (const link of links) {
    if (link.canonical === link.alias) problems.push(`${link.canonical} is linked to itself`);
    if (canonicals.has(link.canonical)) problems.push(`${link.canonical} is the target of more than one link`);
    if (aliases.has(link.alias)) problems.push(`${link.alias} is linked more than once`);
    canonicals.add(link.canonical);
    aliases.add(link.alias);
  }
  const selfLinked = new Set(links.filter((link) => link.canonical === link.alias).map((link) => link.canonical));
  for (const code of canonicals) {
    if (aliases.has(code) && !selfLinked.has(code)) problems.push(`${code} is both a canonical KPI and an alias`);
  }
  return problems;
}

export function planCopy(source: SourceValue[], existing: LinkedValue[]): CopyPlan {
  const existingByPeriod = new Map(existing.map((value) => [value.period, value]));
  const plan: CopyPlan = { create: [], update: [], unchanged: 0 };

  for (const value of source) {
    const current = existingByPeriod.get(value.period);
    if (!current) plan.create.push(value);
    else if (current.value !== value.value || current.coverageNote !== value.coverageNote) plan.update.push(value);
    else plan.unchanged++;
  }
  return plan;
}
