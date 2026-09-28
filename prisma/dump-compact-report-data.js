"use strict";
// One-off: dumps the real data behind the Compact Progress Report (the
// reconciled Compact-outcome KPIs plus Programmes/Projects/Bottlenecks) as
// JSON to stdout, run from inside the api container so it reads the
// container's own DATABASE_URL - no connection string needs to leave the
// VPS. Mirrors reports.service.ts's deliverySection/bottleneckSection
// shape and the reconciled KPI codes from the Cycle 1 2026 backfill.
//
// Run with: node dump-compact-report-data.js > /tmp/compact-report-data.json
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const COMPACT_KPI_CODES = ["M300-P2-024", "M300-PX-001", "M300-P2-008", "M300-P1-004", "M300-P4-002"];

function toKebab(value) {
  return String(value)
    .split("_")
    .join("-")
    .toLowerCase();
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

  const kpis = await prisma.kpiDefinition.findMany({
    where: { code: { in: COMPACT_KPI_CODES } },
    include: { targetPoints: true },
  });
  const kpiValues = await prisma.kpiValue.findMany({
    where: { kpiDefinitionId: { in: kpis.map((k) => k.id) } },
    orderBy: { period: "asc" },
  });

  const compactKpis = kpis.map((kpi) => ({
    code: kpi.code,
    name: kpi.name,
    unit: kpi.unit,
    baseline: kpi.baseline === null ? null : Number(kpi.baseline),
    baselineLabel: kpi.baselineLabel,
    target: kpi.target === null ? null : Number(kpi.target),
    targetLabel: kpi.targetLabel,
    actuals: kpiValues
      .filter((v) => v.kpiDefinitionId === kpi.id)
      .map((v) => ({ period: v.period, value: Number(v.value) })),
    targetPoints: kpi.targetPoints.map((tp) => ({ period: tp.period, value: Number(tp.value) })),
  }));

  const programmes = await prisma.programme.findMany({ include: { pillar: true } });
  const projects = await prisma.project.findMany({ include: { pillar: true } });
  const bottlenecks = await prisma.bottleneck.findMany({ include: { pillar: true } });

  const out = {
    generatedAt: new Date().toISOString(),
    compactKpis,
    programmes: programmes.map((p) => ({
      id: p.id,
      name: p.name,
      leadInstitution: p.leadInstitution,
      pillar: p.pillar.slug,
      status: toKebab(p.status),
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      pillar: p.pillar.slug,
      status: toKebab(p.currentStatus),
    })),
    bottlenecks: bottlenecks.map((b) => ({
      id: b.id,
      issue: b.issue,
      category: toKebab(b.category),
      severity: toKebab(b.severity),
      status: toKebab(b.status),
      ageDays: Math.floor((Date.now() - b.dateRaised.getTime()) / (24 * 60 * 60 * 1000)),
      followUp: b.followUp,
    })),
  };

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
