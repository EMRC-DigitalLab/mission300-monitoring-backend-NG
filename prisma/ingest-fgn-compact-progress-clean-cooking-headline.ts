import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Backfills the KpiValue actuals for the Executive Overview's "Clean
 * cooking access" headline card, from the Cycle 1 2026 Compact Progress
 * Report ("Nigeria Targets" sheet).
 *
 * M300-P2-025 (renamed "Clean Cooking Access (Canonical)", unit changed
 * households -> %, see kpi-directory.json) backs that card. Deliberately
 * OVERWRITES this KPI's previous beneficiary-event ledger pilot values (13
 * events across 9 households) with the Report's national composite %
 * figure - the same decision already made for M300-P2-024 (electricity
 * access) via ingest-fgn-compact-progress-electricity-access.ts, applied
 * here by direct analogy. Every prior KpiValue for this KPI is deleted
 * before the reconciled ones are inserted, so no stale household-count
 * figure survives alongside the % composite.
 *
 * These values duplicate M300-P2-008 "Clean Cooking Access Rate" exactly
 * (see ingest-fgn-compact-progress-kpi-values.ts) - the two KPIs are kept
 * in sync manually pending a decision on whether to merge them into one.
 *
 * Baseline/target reconciliation (kpi-directory.json) must be loaded first
 * via ingest-kpi-directory.js - this script only adds/replaces KpiValue
 * rows.
 *
 * Same KpiValue-via-Submission-chain approach as
 * ingest-fgn-compact-progress-electricity-access.ts (see its header
 * comment for why - KpiValue.sourceSubmissionItemId is a required, unique
 * FK).
 *
 * Idempotent: every row uses a deterministic id derived from (code, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-fgn-compact-progress-clean-cooking-headline.js
 * (after ingest-kpi-directory.js has already run against the same DB)
 */

const VALUES_PATH = join(
  process.cwd(),
  "prisma",
  "data",
  "fgn-compact-progress-2026-clean-cooking-headline-values.json",
);
const CDMU_INSTITUTION_ID = "seed-institution-cdmu";
const CDMU_INSTITUTION_NAME = "Compact Delivery and Monitoring Unit (CDMU)";
const SOURCE_REFERENCE =
  '0. Nigeria_Cycle 1 2026_Mission 300_Compact Progress Report_Worksheet_06_09_26.xlsx, "Nigeria Targets" sheet';

// The KPI whose prior (beneficiary-event ledger pilot) values are being
// deliberately replaced by the Report's national composite figure - see
// header comment above.
const OVERWRITE_CODE = "M300-P2-025";

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

  const overwriteKpi = await prisma.kpiDefinition.findUnique({ where: { code: OVERWRITE_CODE } });
  if (!overwriteKpi) {
    throw new Error(`KPI ${OVERWRITE_CODE} not found - run ingest-kpi-directory.js against this database first.`);
  }
  const deleted = await prisma.kpiValue.deleteMany({ where: { kpiDefinitionId: overwriteKpi.id } });
  console.log(`Deleted ${deleted.count} prior KpiValue row(s) for ${OVERWRITE_CODE} (beneficiary-event ledger pilot).`);

  let backfilled = 0;

  for (const { code, period, value } of values) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code } });
    if (!kpi) {
      throw new Error(`KPI ${code} not found - run ingest-kpi-directory.js against this database first.`);
    }

    const submissionId = `fgn-compact-progress-2026-clean-cooking-headline-submission-${code}`;
    const itemId = `fgn-compact-progress-2026-clean-cooking-headline-item-${code}-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference: SOURCE_REFERENCE,
        notes:
          "Backfilled by ingest-fgn-compact-progress-clean-cooking-headline.ts, not submitted through the live review queue.",
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
