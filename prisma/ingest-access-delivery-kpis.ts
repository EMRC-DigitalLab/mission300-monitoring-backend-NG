import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Backfills the four "Access delivery by channel" KPIs the Executive
 * Overview reads by code (M300-P2-001/003/006/011 - see
 * ExecutiveOverviewService.getOverview). Those cards rendered 0 because no
 * KpiValue had ever been written against these specific codes, even though
 * the underlying figures already existed in this repo:
 *
 * - M300-P2-003 "Mini-Grid Customer Connections" <- REA register's active
 *   household (446,750) + MSME (26,525) mini-grid connections.
 * - M300-P2-006 "Solar Home Systems Deployed" <- REA register's cumulative
 *   SHS units deployed (1,476,608).
 * - M300-P2-001 "New Grid Connections (Annual)" <- computed from
 *   DiscoPerformanceRecord exactly as the KPI's own formula states
 *   ("current active registered grid customers minus comparable
 *   prior-period active registered customers"): national active customers
 *   in the latest complete year minus the same quarter a year earlier.
 * - M300-P2-011 "Improved Cookstoves Distributed" is deliberately NOT
 *   backfilled - neither the REA register nor the NERC workbook carries a
 *   cookstove figure, so that card honestly stays at "no data yet".
 *
 * Same KpiValue-via-Submission-chain approach as the other ingest-*
 * scripts. Idempotent: deterministic ids derived from (kpiCode, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-access-delivery-kpis.js
 * (after ingest-kpi-directory.js and ingest-nerc-disco-data.js)
 */

const REA_VALUES_PATH = join(process.cwd(), "prisma", "data", "rea-kpi-baseline-values.json");
const REA_INSTITUTION_ID = "seed-institution-rea";
const REA_INSTITUTION_NAME = "Rural Electrification Agency (REA)";
const NERC_INSTITUTION_ID = "seed-institution-nerc";
const NERC_INSTITUTION_NAME = "Nigerian Electricity Regulatory Commission (NERC)";

const REA_SOURCE =
  'EMRC - M300 REA KPI Requirements and Project Register v1-1 2026-09-09.xlsx, "KPI Requirements" sheet';
const NERC_SOURCE =
  "Compiled NERC Data 2020-2026 (national active registered customers, year-on-year)";

const QUARTER_END_MONTH_DAY: Record<number, [number, number]> = {
  1: [2, 31],
  2: [5, 30],
  3: [8, 30],
  4: [11, 31],
};

function approvedAtFor(period: string): Date {
  const quarter = /^q([1-4])-(\d{4})$/.exec(period);
  if (quarter) {
    const [, q, year] = quarter;
    const [month, day] = QUARTER_END_MONTH_DAY[Number(q)];
    return new Date(Date.UTC(Number(year), month, day));
  }
  const yearOnly = /^\d{4}$/.exec(period);
  if (yearOnly) return new Date(Date.UTC(Number(period), 11, 31));
  throw new Error(`Cannot derive a date from period "${period}".`);
}

function periodSortKey(period: string): number {
  const match = /^q([1-4])-(\d{4})$/.exec(period);
  if (!match) return -Infinity;
  return Number(match[2]) * 10 + Number(match[1]);
}

interface BaselineValue {
  code: string;
  value: number;
  period: string;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");
  const adminId = admin.id;

  const rea = await prisma.institution.upsert({
    where: { id: REA_INSTITUTION_ID },
    create: { id: REA_INSTITUTION_ID, name: REA_INSTITUTION_NAME, type: "Federal Agency" },
    update: {},
  });
  const nerc = await prisma.institution.upsert({
    where: { id: NERC_INSTITUTION_ID },
    create: { id: NERC_INSTITUTION_ID, name: NERC_INSTITUTION_NAME, type: "Regulator" },
    update: {},
  });

  async function backfillOne(
    kpiCode: string,
    institutionId: string,
    period: string,
    value: number,
    sourceReference: string,
  ) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code: kpiCode } });
    if (!kpi) throw new Error(`KPI ${kpiCode} not found - run ingest-kpi-directory.js first.`);

    const submissionId = `access-delivery-submission-${kpiCode}-${period}`;
    const itemId = `access-delivery-item-${kpiCode}-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId,
        submittedById: adminId,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference,
        notes: "Backfilled by ingest-access-delivery-kpis.ts, not submitted through the live review queue.",
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
          comment: "Historical bulk import - approved as part of the access-delivery backfill.",
        },
      });
    }

    await prisma.kpiValue.upsert({
      where: { sourceSubmissionItemId: itemId },
      create: {
        kpiDefinitionId: kpi.id,
        institutionId,
        period,
        value,
        sourceSubmissionItemId: itemId,
        approvedAt: approvedAtFor(period),
      },
      update: { value, approvedAt: approvedAtFor(period) },
    });
    console.log(`  ${kpiCode} ${period} = ${value}`);
  }

  const reaValues = JSON.parse(readFileSync(REA_VALUES_PATH, "utf-8")) as BaselineValue[];
  const byCode = new Map(reaValues.map((entry) => [entry.code, entry]));

  const households = byCode.get("M300-P2-028");
  const msmes = byCode.get("M300-P2-029");
  if (households && msmes) {
    await backfillOne(
      "M300-P2-003",
      rea.id,
      households.period,
      households.value + msmes.value,
      `${REA_SOURCE} (active household + MSME mini-grid connections)`,
    );
  }

  const shs = byCode.get("M300-P2-030");
  if (shs) {
    await backfillOne("M300-P2-006", rea.id, shs.period, shs.value, `${REA_SOURCE} (cumulative SHS units deployed)`);
  }

  const records = await prisma.discoPerformanceRecord.findMany({
    select: { period: true, activeCustomers: true },
  });
  const customersByPeriod = new Map<string, number>();
  for (const record of records) {
    if (periodSortKey(record.period) === -Infinity) continue;
    customersByPeriod.set(record.period, (customersByPeriod.get(record.period) ?? 0) + record.activeCustomers);
  }
  const quarters = [...customersByPeriod.keys()].sort((a, b) => periodSortKey(b) - periodSortKey(a));
  const latest = quarters[0];
  if (latest) {
    const [, quarter, year] = /^q([1-4])-(\d{4})$/.exec(latest)!;
    const priorYear = `q${quarter}-${Number(year) - 1}`;
    const latestTotal = customersByPeriod.get(latest)!;
    const priorTotal = customersByPeriod.get(priorYear);
    if (priorTotal !== undefined) {
      await backfillOne(
        "M300-P2-001",
        nerc.id,
        latest,
        latestTotal - priorTotal,
        `${NERC_SOURCE}: ${latest} minus ${priorYear}`,
      );
    } else {
      console.log(`  M300-P2-001 skipped - no ${priorYear} comparator for ${latest}`);
    }
  }

  console.log("Access-delivery backfill complete.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
