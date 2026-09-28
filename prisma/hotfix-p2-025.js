"use strict";
// One-off hotfix: applies the M300-P2-025 reconciliation directly against
// the running staging database, without waiting for a new image deploy.
// Does exactly what ingest-kpi-directory.js + ingest-fgn-compact-progress-
// clean-cooking-headline.js would do, for this one KPI only, with all data
// inlined so no other files need to be copied in.
//
// Run with: DATABASE_URL=... node hotfix-p2-025.js
// Pass --if-missing during staging deploys. It only applies the backfill when
// this KPI has no values, so later deploys preserve values edited in the app.
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const ENTRY = {
  code: "M300-P2-025",
  name: "Clean Cooking Access (Canonical)",
  unit: "%",
  pillarSlug: "clean-cooking",
  isActive: true,
  category: "Outcome",
  readiness: "SUPPORTING",
  definition:
    "Share of the national population with access to clean cooking solutions — the Compact-wide composite figure reported by the CDMU, not a sum of individually verified beneficiary events.",
  formula: "As reported by the CDMU in the Compact Progress Report; no beneficiary-event ledger backs this figure yet",
  aggregation: "National",
  frequency: "Annual",
  disaggregation: "None available at this scale yet",
  limitations:
    'Reconciled to the Cycle 1 2026 Compact Progress Report ("Nigeria Targets" sheet) as the national composite figure, replacing the earlier beneficiary-event ledger pilot (13 events across 9 households) that this KPI held while ledger data was the only source — that pilot data has been superseded, not merged in. Renamed from "Clean Cooking — Verified Beneficiary Households (Canonical)" and changed unit from households to % to match what the Report actually reports. Individually verified beneficiary-event tracking may resume here once submission volume reaches national scale; until then this is a manually reported total, not an audited sum. Duplicates M300-P2-008\'s reconciled figures exactly — the two are kept in sync manually pending a decision on whether to merge them into one KPI.',
  sourceInstitution: "CDMU",
  sourceDataset: "Compact Progress Report",
  sourceReference: '0. Nigeria_Cycle 1 2026_Mission 300_Compact Progress Report_Worksheet_06_09_26.xlsx, "Nigeria Targets" sheet',
  version: "v1.0",
  direction: "HIGHER_IS_BETTER",
  baseline: 25.6,
  baselineLabel: "25.6% (Cycle 1 2026 Compact Progress Report baseline)",
  target: 100,
  targetLabel: "100% clean cooking access by 2030 (Nigeria National Energy Compact commitment, per Cycle 1 2026 Compact Progress Report)",
  targetDate: "2030",
  targetBasis: "LEVEL",
  targetBasisLabel: null,
  externalStandardAlignment: null,
  targetPoints: [
    { period: "2025", value: 41, label: "41% by 2025 (Cycle 1 2026 Compact Progress Report)" },
    { period: "2026", value: 52, label: "52% by 2026 (Cycle 1 2026 Compact Progress Report)" },
    { period: "2027", value: 68, label: "68% by 2027 (Cycle 1 2026 Compact Progress Report)" },
    { period: "2028", value: 86.5, label: "86.5% by 2028 (Cycle 1 2026 Compact Progress Report)" },
    { period: "2029", value: 100, label: "100% by 2029 (Cycle 1 2026 Compact Progress Report)" },
    { period: "2030", value: 100, label: "100% by 2030 (Cycle 1 2026 Compact Progress Report)" },
  ],
};

const ACTUAL_VALUES = [
  { period: "2024", value: 25.6 },
  { period: "2025", value: 28.8 },
  { period: "2026", value: 29.0 },
];

const CDMU_INSTITUTION_ID = "seed-institution-cdmu";
const CDMU_INSTITUTION_NAME = "Compact Delivery and Monitoring Unit (CDMU)";
const SOURCE_REFERENCE = '0. Nigeria_Cycle 1 2026_Mission 300_Compact Progress Report_Worksheet_06_09_26.xlsx, "Nigeria Targets" sheet';

function approvedAtFor(period) {
  return new Date(Date.UTC(Number(period), 11, 31));
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

  if (process.argv.includes("--if-missing")) {
    const existingKpi = await prisma.kpiDefinition.findUnique({ where: { code: ENTRY.code } });
    if (existingKpi) {
      const existingValues = await prisma.kpiValue.count({ where: { kpiDefinitionId: existingKpi.id } });
      if (existingValues > 0) {
        console.log(`${ENTRY.code} already has ${existingValues} value(s); preserving them.`);
        await prisma.$disconnect();
        return;
      }
    }
  }

  const pillar = await prisma.pillar.findUnique({ where: { slug: ENTRY.pillarSlug } });
  if (!pillar) throw new Error(`Pillar "${ENTRY.pillarSlug}" not found.`);

  const data = {
    name: ENTRY.name,
    unit: ENTRY.unit,
    pillarId: pillar.id,
    isActive: ENTRY.isActive,
    category: ENTRY.category,
    readiness: ENTRY.readiness,
    definition: ENTRY.definition,
    formula: ENTRY.formula,
    aggregation: ENTRY.aggregation,
    frequency: ENTRY.frequency,
    disaggregation: ENTRY.disaggregation,
    limitations: ENTRY.limitations,
    sourceInstitution: ENTRY.sourceInstitution,
    sourceDataset: ENTRY.sourceDataset,
    sourceReference: ENTRY.sourceReference,
    version: ENTRY.version,
    direction: ENTRY.direction,
    baseline: ENTRY.baseline,
    baselineLabel: ENTRY.baselineLabel,
    target: ENTRY.target,
    targetLabel: ENTRY.targetLabel,
    targetDate: ENTRY.targetDate,
    targetBasis: ENTRY.targetBasis,
    targetBasisLabel: ENTRY.targetBasisLabel,
    externalStandardAlignment: ENTRY.externalStandardAlignment ?? undefined,
  };

  const kpi = await prisma.kpiDefinition.upsert({
    where: { code: ENTRY.code },
    create: { code: ENTRY.code, ...data },
    update: data,
  });
  console.log(`KpiDefinition ${ENTRY.code} upserted (name/unit/baseline/target reconciled).`);

  await prisma.kpiTargetPoint.deleteMany({ where: { kpiDefinitionId: kpi.id } });
  await prisma.kpiTargetPoint.createMany({
    data: ENTRY.targetPoints.map((tp) => ({ kpiDefinitionId: kpi.id, period: tp.period, value: tp.value, label: tp.label })),
  });
  console.log(`KpiTargetPoint: ${ENTRY.targetPoints.length} replaced.`);

  const institution = await prisma.institution.upsert({
    where: { id: CDMU_INSTITUTION_ID },
    create: { id: CDMU_INSTITUTION_ID, name: CDMU_INSTITUTION_NAME, type: "Federal Coordinating Unit" },
    update: {},
  });

  const admin = await prisma.user.findFirst({ where: { role: "SYSTEM_ADMINISTRATOR" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");

  const deleted = await prisma.kpiValue.deleteMany({ where: { kpiDefinitionId: kpi.id } });
  console.log(`Deleted ${deleted.count} prior KpiValue row(s) for ${ENTRY.code}.`);

  const submissionId = `fgn-compact-progress-2026-clean-cooking-headline-submission-${ENTRY.code}`;
  await prisma.submission.upsert({
    where: { id: submissionId },
    create: {
      id: submissionId,
      institutionId: institution.id,
      submittedById: admin.id,
      method: "MANUAL_ENTRY",
      status: "APPROVED",
      sourceReference: SOURCE_REFERENCE,
      notes: "Backfilled by hotfix-p2-025.js, not submitted through the live review queue.",
      reviewerId: admin.id,
    },
    update: {},
  });

  for (const { period, value } of ACTUAL_VALUES) {
    const itemId = `fgn-compact-progress-2026-clean-cooking-headline-item-${ENTRY.code}-${period}`;
    await prisma.submissionItem.upsert({
      where: { id: itemId },
      create: { id: itemId, submissionId, kpiDefinitionId: kpi.id, period, value },
      update: { value },
    });
    await prisma.kpiValue.upsert({
      where: { sourceSubmissionItemId: itemId },
      create: {
        kpiDefinitionId: kpi.id,
        institutionId: institution.id,
        period,
        value,
        sourceSubmissionItemId: itemId,
        approvedAt: approvedAtFor(period),
      },
      update: { value, approvedAt: approvedAtFor(period) },
    });
  }

  const existingDecision = await prisma.reviewDecision.findFirst({ where: { submissionId } });
  if (!existingDecision) {
    await prisma.reviewDecision.create({
      data: {
        submissionId,
        reviewedById: admin.id,
        decision: "APPROVE",
        comment: "Historical bulk import - approved as part of the Cycle 1 2026 Compact Progress Report backfill.",
      },
    });
  }

  console.log(`KpiValue backfill complete: ${ACTUAL_VALUES.length} values.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
