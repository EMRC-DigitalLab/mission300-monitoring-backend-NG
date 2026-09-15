import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Fills six canonical KPIs that the pillar dashboards read by code and that
 * were rendering "No data yet", even though the figures behind them were
 * already in this database or in the REA register:
 *
 * From DiscoPerformanceRecord (populated by ingest-nerc-disco-data.ts),
 * per quarter, summed across all 12 DisCos:
 * - M300-P3-001 "Total Metered Customers"
 * - M300-P3-002 "Total Unmetered Customers"   (active - metered)
 * - M300-P3-003 "Metering Gap"                (same quantity, the gap to close)
 * - M300-P3-007 "DisCo Revenue Collection"    (NGN Billion)
 * - M300-P3-008 "DisCo Collection Efficiency" (collected / billed x 100)
 *
 * From the REA register:
 * - M300-P4-001 "Mini-Grid Developers with Signed Grant Agreements" - the
 *   same 426 figure already loaded under the supplementary REA code
 *   M300-P4-009; this writes it to the canonical code the Private Sector
 *   pillar's headline card actually reads. Same unit ("developers"), so no
 *   conversion is involved.
 *
 * Deliberately NOT filled, because no source here states them without an
 * assumption that would amount to inventing a figure:
 * - M300-P4-002 / M300-P4-003 (USD Million): the REA register's capital
 *   figures are recorded with "Currency not stated", and are "committed" /
 *   "disbursed" rather than "mobilized". Assigning them to a USD-million
 *   KPI would assume both the currency and the scale.
 * - M300-P1-012 (MW): the NISO workbook carries transmission line length
 *   (km) and substation capacity (MVA), neither of which is transfer
 *   capacity in MW.
 * - M300-PX-001, the regional-integration set and the clean-cooking set:
 *   no figure in either workbook.
 *
 * Idempotent: deterministic ids derived from (kpiCode, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-derived-utility-kpis.js
 */

const REA_VALUES_PATH = join(process.cwd(), "prisma", "data", "rea-kpi-baseline-values.json");
const NERC_INSTITUTION_ID = "seed-institution-nerc";
const NERC_INSTITUTION_NAME = "Nigerian Electricity Regulatory Commission (NERC)";
const REA_INSTITUTION_ID = "seed-institution-rea";
const REA_INSTITUTION_NAME = "Rural Electrification Agency (REA)";

const NERC_SOURCE = "Compiled NERC Data 2020-2026 (summed across all 12 DisCos)";
const REA_SOURCE =
  'EMRC - M300 REA KPI Requirements and Project Register v1-1 2026-09-09.xlsx, "KPI Requirements" sheet';

const QUARTER_END_MONTH_DAY: Record<number, [number, number]> = {
  1: [2, 31],
  2: [5, 30],
  3: [8, 30],
  4: [11, 31],
};

function approvedAtFor(period: string): Date {
  const quarter = /^q([1-4])-(\d{4})$/.exec(period);
  if (quarter) {
    const [month, day] = QUARTER_END_MONTH_DAY[Number(quarter[1])];
    return new Date(Date.UTC(Number(quarter[2]), month, day));
  }
  const yearOnly = /^\d{4}$/.exec(period);
  if (yearOnly) return new Date(Date.UTC(Number(period), 11, 31));
  throw new Error(`Cannot derive a date from period "${period}".`);
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

  const nerc = await prisma.institution.upsert({
    where: { id: NERC_INSTITUTION_ID },
    create: { id: NERC_INSTITUTION_ID, name: NERC_INSTITUTION_NAME, type: "Regulator" },
    update: {},
  });
  const rea = await prisma.institution.upsert({
    where: { id: REA_INSTITUTION_ID },
    create: { id: REA_INSTITUTION_ID, name: REA_INSTITUTION_NAME, type: "Federal Agency" },
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

    const submissionId = `derived-submission-${kpiCode}-${period}`;
    const itemId = `derived-item-${kpiCode}-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId,
        submittedById: adminId,
        method: "MANUAL_ENTRY",
        status: "APPROVED",
        sourceReference,
        notes: "Backfilled by ingest-derived-utility-kpis.ts, not submitted through the live review queue.",
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
          comment: "Historical bulk import - approved as part of the derived-KPI backfill.",
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
  }

  const records = await prisma.discoPerformanceRecord.findMany();
  const QUARTER = /^q[1-4]-\d{4}$/;
  const byPeriod = new Map<
    string,
    { active: number; metered: number; revenueBilled: number; revenueCollected: number }
  >();
  for (const record of records) {
    if (!QUARTER.test(record.period)) continue;
    const totals = byPeriod.get(record.period) ?? {
      active: 0,
      metered: 0,
      revenueBilled: 0,
      revenueCollected: 0,
    };
    totals.active += record.activeCustomers;
    totals.metered += record.meteredCustomers;
    totals.revenueBilled += Number(record.revenueBilledNgn);
    totals.revenueCollected += Number(record.revenueCollectedNgn);
    byPeriod.set(record.period, totals);
  }

  let written = 0;
  for (const [period, totals] of byPeriod) {
    if (totals.metered > 0) {
      await backfillOne("M300-P3-001", nerc.id, period, totals.metered, `${NERC_SOURCE}: metered customers`);
      written++;
    }
    if (totals.active > 0) {
      const unmetered = Math.max(0, totals.active - totals.metered);
      await backfillOne(
        "M300-P3-002",
        nerc.id,
        period,
        unmetered,
        `${NERC_SOURCE}: active customers minus metered customers`,
      );
      await backfillOne(
        "M300-P3-003",
        nerc.id,
        period,
        unmetered,
        `${NERC_SOURCE}: unmetered customers, the gap still to close`,
      );
      written += 2;
    }
    if (totals.revenueCollected > 0) {
      await backfillOne(
        "M300-P3-007",
        nerc.id,
        period,
        totals.revenueCollected / 1e9,
        `${NERC_SOURCE}: revenue collected`,
      );
      written++;
    }
    if (totals.revenueBilled > 0) {
      await backfillOne(
        "M300-P3-008",
        nerc.id,
        period,
        (totals.revenueCollected / totals.revenueBilled) * 100,
        `${NERC_SOURCE}: revenue collected / revenue billed`,
      );
      written++;
    }
  }

  const reaValues = JSON.parse(readFileSync(REA_VALUES_PATH, "utf-8")) as BaselineValue[];
  const developers = reaValues.find((entry) => entry.code === "M300-P4-009");
  if (developers) {
    await backfillOne(
      "M300-P4-001",
      rea.id,
      developers.period,
      developers.value,
      `${REA_SOURCE} (mini-grid developers with signed grant agreements)`,
    );
    written++;
  }

  console.log(`KpiValue backfill complete: ${written} values across 6 canonical KPIs.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
