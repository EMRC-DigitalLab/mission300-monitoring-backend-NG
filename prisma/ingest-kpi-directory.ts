import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, KpiDirection, KpiReadinessTier, KpiTargetBasis } from "@prisma/client";

/**
 * One-off ingestion of the real M300 KPI directory (EMRC - M300 KPI Matrix
 * v2-0 2026-06-29.xlsx, exported to prisma/data/kpi-directory.json) -
 * replaces the illustrative/example KPIs seed.ts creates for local dev with
 * the actual approved catalogue. Idempotent (upserts by code/slug), so
 * re-running it is always safe - this is what makes it safe to run once
 * against staging, confirm, then run again unchanged against production.
 *
 * Deliberately separate from seed.ts: seed.ts also creates fake demo
 * institutions/programmes/submissions for local dev, which staging and
 * production must NOT get. This script touches only Pillar and
 * KpiDefinition (+ its KpiTargetPoint children) - never KpiValue, since
 * "approving a submission is the only thing allowed to write a new
 * KpiValue" (see submissions.service.ts) - baseline/target are the only
 * values a catalogue import may set, current values only ever arrive
 * through the real submission/approval pipeline.
 *
 * Run with: DATABASE_URL=... npx ts-node -r tsconfig-paths/register prisma/ingest-kpi-directory.ts
 */

// Same 6 fixed pillars seed.ts creates for local dev (matches pillarIdSchema
// in m300-frontend/src/api/schemas/common.ts exactly) - the KPI directory's
// own pillarSlug values were checked against exactly this set with no
// mismatches, so nothing further is needed from the source spreadsheet.
const PILLARS: { slug: string; name: string }[] = [
  { slug: "generation-network", name: "Generation & network" },
  { slug: "last-mile-access", name: "Last-mile access" },
  { slug: "financially-viable-utilities", name: "Financially Viable Utilities" },
  { slug: "private-sector-participation", name: "Private sector" },
  { slug: "regional-integration", name: "Regional integration" },
  { slug: "clean-cooking", name: "Clean cooking" },
];

interface KpiDirectoryEntry {
  code: string;
  name: string;
  unit: string;
  pillarSlug: string;
  isActive: boolean;
  category: string;
  readiness: keyof typeof KpiReadinessTier;
  definition: string;
  formula: string;
  aggregation: string;
  frequency: string;
  disaggregation: string;
  limitations: string;
  sourceInstitution: string;
  sourceDataset: string;
  sourceReference: string;
  version: string;
  direction: keyof typeof KpiDirection;
  baseline: number | null;
  baselineLabel: string;
  target: number | null;
  targetLabel: string;
  targetDate: string | null;
  targetBasis: keyof typeof KpiTargetBasis | null;
  targetBasisLabel: string | null;
  externalStandardAlignment: unknown;
  targetPoints: { period: string; value: number; label: string }[];
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const pillarsBySlug = new Map<string, string>();
  for (const p of PILLARS) {
    const row = await prisma.pillar.upsert({
      where: { slug: p.slug },
      create: p,
      update: { name: p.name },
    });
    pillarsBySlug.set(p.slug, row.id);
  }
  console.log(`Pillars: ${pillarsBySlug.size} upserted.`);

  // process.cwd(), not __dirname - this script runs two ways with two
  // different __dirname values (ts-node from the repo root locally;
  // compiled to dist/prisma/ and run via plain `node` in the deployed
  // container, see docker/Dockerfile), but both invocations share the same
  // working directory (repo root / /app), where prisma/data always lives
  // regardless of where the script itself was compiled to.
  const dataPath = join(process.cwd(), "prisma", "data", "kpi-directory.json");
  const entries = JSON.parse(readFileSync(dataPath, "utf-8")) as KpiDirectoryEntry[];
  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const pillarId = pillarsBySlug.get(entry.pillarSlug);
    if (!pillarId) {
      throw new Error(`Unknown pillarSlug "${entry.pillarSlug}" on KPI ${entry.code} - not one of the 6 seeded pillars.`);
    }

    const data = {
      name: entry.name,
      unit: entry.unit,
      pillarId,
      isActive: entry.isActive,
      category: entry.category,
      readiness: entry.readiness,
      definition: entry.definition,
      formula: entry.formula,
      aggregation: entry.aggregation,
      frequency: entry.frequency,
      disaggregation: entry.disaggregation,
      limitations: entry.limitations,
      sourceInstitution: entry.sourceInstitution,
      sourceDataset: entry.sourceDataset,
      sourceReference: entry.sourceReference,
      version: entry.version,
      direction: entry.direction,
      baseline: entry.baseline,
      baselineLabel: entry.baselineLabel,
      target: entry.target,
      targetLabel: entry.targetLabel,
      targetDate: entry.targetDate,
      targetBasis: entry.targetBasis,
      targetBasisLabel: entry.targetBasisLabel,
      externalStandardAlignment: entry.externalStandardAlignment ?? undefined,
    };

    const existing = await prisma.kpiDefinition.findUnique({ where: { code: entry.code } });
    const kpi = await prisma.kpiDefinition.upsert({
      where: { code: entry.code },
      create: { code: entry.code, ...data },
      update: data,
    });
    if (existing) updated++;
    else created++;

    // Replace-all semantics for targetPoints, same rule PATCH .../kpis/:id
    // already uses (updateKpiMetadataRequestSchema's own comment) - delete
    // every row for this KPI and recreate from the source, rather than
    // trying to diff/match periods.
    await prisma.kpiTargetPoint.deleteMany({ where: { kpiDefinitionId: kpi.id } });
    if (entry.targetPoints.length > 0) {
      await prisma.kpiTargetPoint.createMany({
        data: entry.targetPoints.map((tp) => ({
          kpiDefinitionId: kpi.id,
          period: tp.period,
          value: tp.value,
          label: tp.label,
        })),
      });
    }
  }

  console.log(`KPIs: ${created} created, ${updated} updated, ${entries.length} total.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
