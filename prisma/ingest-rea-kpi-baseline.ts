import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * One-off backfill of a single as-of-Q3-2026 snapshot value for the 21
 * numeric REA KPIs added to prisma/data/kpi-directory.json (codes
 * M300-P2-026..036, M300-P4-009..012, M300-PX-008..013) - see
 * prisma/data/rea-kpi-baseline-values.json, generated directly from
 * "EMRC - M300 REA KPI Requirements and Project Register v1-1
 * 2026-09-09.xlsx", "KPI Requirements" sheet.
 *
 * 2 of the 23 rows in that sheet are deliberately NOT here - both are
 * qualitative, not numeric, and this platform's KpiValue.value is a
 * Decimal:
 * - "Award or agreement date and implementation status" ("05/02/2025 /
 *   Deployed") - a compound date+status field, not a number.
 * - "Facility operational status" ("Yes") - a Yes/No milestone. Matches
 *   this platform's own existing convention for Yes/No KPIs: current/
 *   history stay null, the fact lives in the KpiDefinition's own text
 *   fields only (see that KPI's `limitations` in kpi-directory.json).
 * Their KpiDefinition rows were still added by ingest-kpi-directory.ts, so
 * both are visible in KPI Explorer as "no data yet" rather than missing
 * entirely.
 *
 * Same KpiValue-via-Submission-chain approach as the other ingest-*
 * scripts (see ingest-nerc-genco-kpis.ts's header comment for why -
 * KpiValue.sourceSubmissionItemId is a required, unique FK).
 *
 * Idempotent: every row uses a deterministic id derived from kpiCode.
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-rea-kpi-baseline.js
 * (after ingest-kpi-directory.js has already run against the same DB)
 */

const VALUES_PATH = join(process.cwd(), "prisma", "data", "rea-kpi-baseline-values.json");
const REA_INSTITUTION_ID = "seed-institution-rea";
const REA_INSTITUTION_NAME = "Rural Electrification Agency (REA)";
const SOURCE_REFERENCE =
  'EMRC - M300 REA KPI Requirements and Project Register v1-1 2026-09-09.xlsx, "KPI Requirements" sheet';

const QUARTER_END_MONTH_DAY: Record<number, [number, number]> = {
  1: [2, 31],
  2: [5, 30],
  3: [8, 30],
  4: [11, 31],
};

function approvedAtFor(period: string): Date {
  const quarterMatch = /^q([1-4])-(\d{4})$/.exec(period);
  if (!quarterMatch)
    throw new Error(`Cannot derive a date from period "${period}" - expected "q{1-4}-{year}".`);
  const quarter = Number(quarterMatch[1]);
  const year = Number(quarterMatch[2]);
  const [month, day] = QUARTER_END_MONTH_DAY[quarter];
  return new Date(Date.UTC(year, month, day));
}

interface BaselineValue {
  code: string;
  value: number;
  period: string;
}

async function main() {
  const values = JSON.parse(readFileSync(VALUES_PATH, "utf-8")) as BaselineValue[];
  console.log(`Read ${values.length} baseline values from ${VALUES_PATH}.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const institution = await prisma.institution.upsert({
    where: { id: REA_INSTITUTION_ID },
    create: { id: REA_INSTITUTION_ID, name: REA_INSTITUTION_NAME, type: "Federal Agency" },
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

  for (const { code, value, period } of values) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code } });
    if (!kpi) {
      throw new Error(`KPI ${code} not found - run ingest-kpi-directory.js against this database first.`);
    }

    const submissionId = `rea-kpi-submission-${code}`;
    const itemId = `rea-kpi-item-${code}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference: SOURCE_REFERENCE,
        notes: "Backfilled by ingest-rea-kpi-baseline.ts, not submitted through the live review queue.",
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
          comment: "Historical bulk import - approved as part of the REA KPI Requirements backfill.",
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
