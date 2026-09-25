import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Backfills the KpiValue actuals for the two national KPIs the Cycle 1 2026
 * Compact Progress Report ("Nigeria Targets" sheet) supplies a clean,
 * unit-matching actual for:
 *
 * - M300-P2-008 "Clean Cooking Access Rate" (%)
 * - M300-P1-004 "Renewable Generation Share" (%)
 *
 * The sheet's other two headline rows are deliberately NOT backfilled here:
 * - Electricity access is reported as an absolute people count (137M-154M),
 *   which does not fit M300-PX-001 (a %) or M300-P2-024 (a small verified-
 *   ledger pilot, by design distinct from the national composite) without
 *   inventing a population denominator - left for a deliberate decision.
 * - Private capital mobilized has no actual reported for any year in this
 *   reporting cycle (the sheet's row is blank) - only its target was
 *   reconciled, in kpi-directory.json.
 *
 * Baseline and target reconciliation (kpi-directory.json) must be loaded
 * first via ingest-kpi-directory.js - this script only adds KpiValue rows.
 *
 * Same KpiValue-via-Submission-chain approach as ingest-rea-kpi-baseline.ts
 * (see its header comment for why - KpiValue.sourceSubmissionItemId is a
 * required, unique FK).
 *
 * Idempotent: every row uses a deterministic id derived from (code, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-fgn-compact-progress-kpi-values.js
 * (after ingest-kpi-directory.js has already run against the same DB)
 */

const VALUES_PATH = join(process.cwd(), "prisma", "data", "fgn-compact-progress-2026-kpi-values.json");
const CDMU_INSTITUTION_ID = "seed-institution-cdmu";
const CDMU_INSTITUTION_NAME = "Compact Delivery and Monitoring Unit (CDMU)";
const SOURCE_REFERENCE =
  '0. Nigeria_Cycle 1 2026_Mission 300_Compact Progress Report_Worksheet_06_09_26.xlsx, "Nigeria Targets" sheet';

function approvedAtFor(period: string): Date {
  const yearMatch = /^\d{4}$/.exec(period);
  if (!yearMatch) throw new Error(`Cannot derive a date from period "${period}" - expected "{year}".`);
  return new Date(Date.UTC(Number(period), 11, 31));
}

interface ActualValue {
  code: string;
  period: string;
  value: number;
}

async function main() {
  const values = JSON.parse(readFileSync(VALUES_PATH, "utf-8")) as ActualValue[];
  console.log(`Read ${values.length} actual values from ${VALUES_PATH}.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const institution = await prisma.institution.upsert({
    where: { id: CDMU_INSTITUTION_ID },
    create: { id: CDMU_INSTITUTION_ID, name: CDMU_INSTITUTION_NAME, type: "Federal Coordinating Unit" },
    update: {},
  });

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin)
    throw new Error("No SYSTEM_ADMINISTRATOR user found to attribute the backfilled submissions to.");
  const adminId = admin.id;

  let backfilled = 0;

  for (const { code, period, value } of values) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code } });
    if (!kpi) {
      throw new Error(`KPI ${code} not found - run ingest-kpi-directory.js against this database first.`);
    }

    const submissionId = `fgn-compact-progress-2026-submission-${code}`;
    const itemId = `fgn-compact-progress-2026-item-${code}-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference: SOURCE_REFERENCE,
        notes: "Backfilled by ingest-fgn-compact-progress-kpi-values.ts, not submitted through the live review queue.",
        reviewerId: adminId,
      },
      update: {},
    });

    await prisma.submissionItem.upsert({
      where: { id: itemId },
      create: { id: itemId, submissionId, kpiDefinitionId: kpi.id, period, value },
      update: { value },
    });

    const existingDecision = await prisma.reviewDecision.findFirst({ where: { submissionId } });
    if (!existingDecision) {
      await prisma.reviewDecision.create({
        data: {
          submissionId,
          reviewedById: adminId,
          decision: "APPROVE",
          comment: "Historical bulk import - approved as part of the Cycle 1 2026 Compact Progress Report backfill.",
        },
      });
    }

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

    backfilled++;
  }

  console.log(`KpiValue backfill complete: ${backfilled} values.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
