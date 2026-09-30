import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * One-off audit script (not part of the ingest pipeline) - for every active
 * KPI, reports its declared source institution, its latest value, the
 * period that value is as of, and where that value ACTUALLY came from: a
 * named backfill script (deterministic submission id prefix - see each
 * ingest-*.ts's own `submissionId` construction) or a real submission made
 * through the live Data Submissions review flow.
 */

const BACKFILL_SOURCES: { prefix: string; label: string }[] = [
  { prefix: "access-delivery-submission-", label: "Backfill: Access Delivery dataset (ingest-access-delivery-kpis.ts)" },
  { prefix: "derived-submission-", label: "Backfill: derived/computed from other KPIs (ingest-derived-utility-kpis.ts)" },
  { prefix: "fgn-compact-progress-2026-clean-cooking-headline-submission-", label: "Backfill: FGN Compact Progress Report 2026, Clean Cooking headline" },
  { prefix: "fgn-compact-progress-2026-electricity-access-submission-", label: "Backfill: FGN Compact Progress Report 2026, Electricity Access" },
  { prefix: "fgn-compact-progress-2026-submission-", label: "Backfill: FGN Compact Progress Report 2026 (general)" },
  { prefix: "nerc-rollup-submission-", label: "Backfill: NERC national rollup dataset" },
  { prefix: "nerc-genco-submission-", label: "Backfill: NERC GenCo KPI dataset" },
  { prefix: "nerc-tariff-submission-", label: "Backfill: NERC tariff dataset" },
  { prefix: "niso-bilateral-submission-", label: "Backfill: NISO bilateral trade dataset" },
  { prefix: "niso-generation-submission-", label: "Backfill: NISO generation KPI dataset" },
  { prefix: "niso-remaining-submission-", label: "Backfill: NISO 'remaining sheets' dataset (ingest-niso-remaining-sheets.ts)" },
  { prefix: "rea-kpi-submission-", label: "Backfill: REA KPI baseline dataset" },
];

function classifySubmission(submissionId: string, method: string): string {
  const match = BACKFILL_SOURCES.find((entry) => submissionId.startsWith(entry.prefix));
  if (match) return match.label;
  return `Live submission (${method === "UPLOAD" ? "file upload" : "manual entry"}) via Data Submissions review flow`;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const kpis = await prisma.kpiDefinition.findMany({
    where: { isActive: true },
    include: { pillar: true },
    orderBy: { code: "asc" },
  });

  const allValues = await prisma.kpiValue.findMany({
    include: {
      sourceSubmissionItem: { include: { submission: { include: { institution: true, submittedBy: true } } } },
    },
  });

  const valuesByKpi = new Map<string, typeof allValues>();
  for (const value of allValues) {
    const list = valuesByKpi.get(value.kpiDefinitionId) ?? [];
    list.push(value);
    valuesByKpi.set(value.kpiDefinitionId, list);
  }

  type Row = {
    code: string;
    name: string;
    pillar: string;
    unit: string;
    declaredSourceInstitution: string;
    declaredSourceDataset: string;
    latestValue: string | null;
    latestPeriod: string | null;
    approvedAt: string | null;
    valueCount: number;
    submittingInstitution: string | null;
    provenance: string;
  };

  const rows: Row[] = kpis.map((kpi) => {
    const values = (valuesByKpi.get(kpi.id) ?? []).slice().sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime());
    const latest = values[0];

    return {
      code: kpi.code,
      name: kpi.name,
      pillar: kpi.pillar.name,
      unit: kpi.unit,
      declaredSourceInstitution: kpi.sourceInstitution || "(not stated)",
      declaredSourceDataset: kpi.sourceDataset || "(not stated)",
      latestValue: latest ? latest.value.toString() : null,
      latestPeriod: latest ? latest.period : null,
      approvedAt: latest ? latest.approvedAt.toISOString() : null,
      valueCount: values.length,
      submittingInstitution: latest?.sourceSubmissionItem.submission.institution.name ?? null,
      provenance: latest
        ? classifySubmission(latest.sourceSubmissionItem.submission.id, latest.sourceSubmissionItem.submission.method)
        : "No data yet - zero KpiValue rows exist",
    };
  });

  writeFileSync("prisma/kpi-source-audit.json", JSON.stringify(rows, null, 2));

  const withData = rows.filter((r) => r.latestValue !== null);
  const noData = rows.filter((r) => r.latestValue === null);
  const byProvenance = new Map<string, number>();
  for (const row of withData) byProvenance.set(row.provenance, (byProvenance.get(row.provenance) ?? 0) + 1);

  console.log(`Total active KPIs: ${rows.length}`);
  console.log(`With at least one value: ${withData.length}`);
  console.log(`No data yet: ${noData.length}`);
  console.log(`\nBy provenance:`);
  for (const [label, count] of [...byProvenance.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}\t${label}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
