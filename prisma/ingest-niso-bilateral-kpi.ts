import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Ingests M300-P1-011 "Share of Energy Traded Under Bilateral Contracts"
 * from two sheets of "EMRC - NISO Compiled Data 2020-2026 v1
 * 2026-09-11.xlsx":
 *
 * - Numerator: "Bilateral_Energy_Genco_Disco Ex" (GenCo -> DisCo bilateral
 *   contract export volumes).
 * - Denominator: "Genco Energy Export" (total market generation), the same
 *   sheet ingest-niso-generation-kpis.ts already reads for M300-P1-005 -
 *   read independently here rather than importing that script's totals, so
 *   this stays a standalone, idempotent script like the others.
 *
 * Matches the KPI's own documented formula exactly: "(Total energy MWh
 * transacted under bilateral contracts / Total market energy MWh
 * transacted) x 100".
 *
 * Same partial-quarter guard as ingest-niso-generation-kpis.ts: a quarter
 * with fewer than 3 reported months is skipped rather than understating the
 * ratio (both the numerator and denominator would be short by the same
 * missing months in principle, but only if every GenCo/contract reports on
 * an identical monthly cadence, which is not guaranteed - skipping a
 * partial quarter is the honest choice either way).
 *
 * Idempotent: deterministic ids derived from (kpiCode, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-niso-bilateral-kpi.js
 */

const NISO_WORKBOOK = join(
  process.cwd(),
  "..",
  "emrc-geapp",
  "docs",
  "EMRC - NISO Compiled Data 2020-2026 v1 2026-09-11.xlsx",
);
const SOURCE_REFERENCE =
  'EMRC - NISO Compiled Data 2020-2026 v1 2026-09-11.xlsx ("Bilateral_Energy_Genco_Disco Ex" / "Genco Energy Export")';

const NISO_INSTITUTION_ID = "seed-institution-niso-tcn";
const NISO_INSTITUTION_NAME = "NISO / TCN";

const MONTH_TO_QUARTER: Record<string, number> = {
  January: 1,
  February: 1,
  March: 1,
  April: 2,
  May: 2,
  June: 2,
  July: 3,
  August: 3,
  September: 3,
  October: 4,
  November: 4,
  December: 4,
};

const QUARTER_END_MONTH_DAY: Record<number, [number, number]> = {
  1: [2, 31],
  2: [5, 30],
  3: [8, 30],
  4: [11, 31],
};

function approvedAtFor(period: string): Date {
  const match = /^q([1-4])-(\d{4})$/.exec(period);
  if (!match) throw new Error(`Cannot derive a date from period "${period}".`);
  const [month, day] = QUARTER_END_MONTH_DAY[Number(match[1])];
  return new Date(Date.UTC(Number(match[2]), month, day));
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "");
  }
  return String(value).trim();
}

interface QuarterTotal {
  kwh: number;
  months: Set<string>;
}

function sumByQuarter(sheet: ExcelJS.Worksheet, valueColumn: number): Map<string, QuarterTotal> {
  const byQuarter = new Map<string, QuarterTotal>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const year = Number(row.getCell(2).value);
    const month = cellText(row.getCell(3).value);
    const kwh = Number(row.getCell(valueColumn).value) || 0;
    const quarter = MONTH_TO_QUARTER[month];
    if (!year || !quarter) return;

    const period = `q${quarter}-${year}`;
    const totals = byQuarter.get(period) ?? { kwh: 0, months: new Set<string>() };
    totals.kwh += kwh;
    totals.months.add(month);
    byQuarter.set(period, totals);
  });
  return byQuarter;
}

async function main() {
  console.log(`Reading workbook: ${NISO_WORKBOOK}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(NISO_WORKBOOK);

  const bilateralSheet = workbook.getWorksheet("Bilateral_Energy_Genco_Disco Ex");
  if (!bilateralSheet) throw new Error('Sheet "Bilateral_Energy_Genco_Disco Ex" not found.');
  const totalSheet = workbook.getWorksheet("Genco Energy Export");
  if (!totalSheet) throw new Error('Sheet "Genco Energy Export" not found.');

  const bilateralByQuarter = sumByQuarter(bilateralSheet, 4);
  const totalByQuarter = sumByQuarter(totalSheet, 4);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");
  const adminId = admin.id;

  const institution = await prisma.institution.upsert({
    where: { id: NISO_INSTITUTION_ID },
    create: { id: NISO_INSTITUTION_ID, name: NISO_INSTITUTION_NAME, type: "Federal Agency" },
    update: {},
  });

  const kpi = await prisma.kpiDefinition.findUnique({ where: { code: "M300-P1-011" } });
  if (!kpi) throw new Error("KPI M300-P1-011 not found - run the KPI directory ingestion first.");

  let written = 0;
  const skipped: string[] = [];

  for (const [period, bilateral] of bilateralByQuarter) {
    const total = totalByQuarter.get(period);
    if (!total || total.kwh <= 0) {
      skipped.push(`${period} (no total-generation figure)`);
      continue;
    }
    if (bilateral.months.size < 3 || total.months.size < 3) {
      skipped.push(`${period} (${bilateral.months.size}/${total.months.size} months reported)`);
      continue;
    }

    const share = (bilateral.kwh / total.kwh) * 100;

    const submissionId = `niso-bilateral-submission-${period}`;
    const itemId = `niso-bilateral-item-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "UPLOAD",
        status: "APPROVED",
        sourceReference: SOURCE_REFERENCE,
        notes: "Backfilled by ingest-niso-bilateral-kpi.ts, not submitted through the live review queue.",
        reviewerId: adminId,
      },
      update: {},
    });

    await prisma.submissionItem.upsert({
      where: { id: itemId },
      create: { id: itemId, submissionId, kpiDefinitionId: kpi.id, period, value: share },
      update: { value: share },
    });

    const existingDecision = await prisma.reviewDecision.findFirst({ where: { submissionId } });
    if (!existingDecision) {
      await prisma.reviewDecision.create({
        data: {
          submissionId,
          reviewedById: adminId,
          decision: "APPROVE",
          comment: "Historical bulk import - approved as part of the NISO bilateral-trading backfill.",
        },
      });
    }

    await prisma.kpiValue.upsert({
      where: { sourceSubmissionItemId: itemId },
      create: {
        kpiDefinitionId: kpi.id,
        institutionId: institution.id,
        period,
        value: share,
        sourceSubmissionItemId: itemId,
        approvedAt: approvedAtFor(period),
      },
      update: { value: share, approvedAt: approvedAtFor(period) },
    });
    written++;
  }

  if (skipped.length > 0) console.log(`Skipped: ${skipped.join(", ")}`);
  console.log(`KpiValue backfill complete: ${written} values for M300-P1-011.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
