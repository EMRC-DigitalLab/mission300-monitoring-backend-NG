import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { statusLabel, statusValueError } from "./lib/status-values";

const REA_INSTITUTION_ID = "seed-institution-rea";
const REA_SOURCE = 'EMRC - M300 REA KPI Requirements and Project Register v1-1 2026-09-09.xlsx, "KPI Requirements" sheet';
const PERIOD = "q3-2026";
const APPROVED_AT = new Date(Date.UTC(2026, 8, 30));

const STATUS_VALUES: { code: string; value: number; reference: string }[] = [
  {
    code: "M300-P4-013",
    value: 2,
    reference: `${REA_SOURCE}, "Facility operational status" (Project Preparation Facility): Yes`,
  },
  {
    code: "M300-P2-037",
    value: 2,
    reference: `${REA_SOURCE}, "Award or agreement date and implementation status": "05/02/2025 / Deployed". Day/month order of the date is unconfirmed.`,
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });
  const admin = await prisma.user.findFirst({ where: { role: "SYSTEM_ADMINISTRATOR" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");

  console.log(dryRun ? "DRY RUN - nothing written\n" : "Applied\n");

  for (const entry of STATUS_VALUES) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code: entry.code } });
    if (!kpi) throw new Error(`KPI ${entry.code} not found.`);
    const problem = statusValueError(kpi.unit, entry.value);
    if (problem) throw new Error(`${entry.code}: ${problem}`);

    const existing = await prisma.kpiValue.findFirst({ where: { kpiDefinitionId: kpi.id, period: PERIOD } });
    const state = !existing ? "to load" : Number(existing.value) === entry.value ? "already loaded" : "differs - not overwritten";
    console.log(`${entry.code} ${kpi.name} [${kpi.unit}]: ${statusLabel(entry.value)} for ${PERIOD} - ${state}`);
    if (dryRun || existing) continue;

    const submissionId = `status-submission-${entry.code}-${PERIOD}`;
    const itemId = `status-item-${entry.code}-${PERIOD}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: REA_INSTITUTION_ID,
        submittedById: admin.id,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference: entry.reference,
        notes: "Text value from the REA file recorded on the status scale, by load-status-values.ts.",
        reviewerId: admin.id,
      },
      update: {},
    });
    await prisma.submissionItem.upsert({
      where: { id: itemId },
      create: { id: itemId, submissionId, kpiDefinitionId: kpi.id, period: PERIOD, value: entry.value },
      update: {},
    });
    if (!(await prisma.reviewDecision.findFirst({ where: { submissionId } }))) {
      await prisma.reviewDecision.create({
        data: { submissionId, reviewedById: admin.id, decision: "APPROVE", comment: "Recorded from the REA file." },
      });
    }
    await prisma.kpiValue.upsert({
      where: { sourceSubmissionItemId: itemId },
      create: {
        kpiDefinitionId: kpi.id,
        institutionId: REA_INSTITUTION_ID,
        period: PERIOD,
        value: entry.value,
        sourceSubmissionItemId: itemId,
        approvedAt: APPROVED_AT,
      },
      update: {},
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
