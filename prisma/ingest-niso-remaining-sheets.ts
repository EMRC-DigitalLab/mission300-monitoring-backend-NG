import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Ingests the 5 sheets of "EMRC - NISO Compiled Data 2020-2026 v1
 * 2026-09-11.xlsx" not covered by ingest-niso-generation-kpis.ts,
 * ingest-niso-bilateral-kpi.ts or ingest-niso-project-register.ts:
 *
 * - "Bilateral_Inv_Pay_USD" -> M300-P5-003 "Export Revenue Collected" (%).
 *   All 6 named contract profiles (Kainji-NIGELEC,
 *   Odukpani-CEET, Paras-CEET, Paras-SBPE, Afam3-SBPE, Delta-SBPE) are
 *   Nigeria GenCo -> neighbouring-country-utility exports (NIGELEC/Niger,
 *   CEET/Togo, SBPE/Benin) - this IS the cross-border export revenue sheet
 *   the KPI's own formula already names, not a domestic bilateral-market
 *   sheet as first assumed.
 * - "TnxLine & Susbstation Capacity" -> M300-P1-017 (line length, km) and
 *   M300-P1-018 (substation capacity, MVA). Single as-of snapshot, no
 *   period column - written once under the current quarter.
 * - "Planned Gen Capacity" -> M300-P1-019 (Committed) and M300-P1-020
 *   (Candidate), summed nameplate MW by the sheet's own STATUS column.
 *   Single as-of snapshot, same as above.
 * - "Cross-border connections" -> M300-P5-006, summed interconnector line
 *   length (km). Single as-of snapshot.
 * - "National Demand Forecast" -> M300-PX-014, one value per year,
 *   explicitly labelled a forecast (see that KPI's own definition/
 *   limitations) - never treated as an actual reported peak demand.
 *
 * Two sheets are deliberately NOT ingested anywhere, with no new KPI
 * invented for them:
 * - "Zungeru Energy Disco Received" - the DisCo-side view of the exact
 *   same transactions "Zungeru Energy Exports" already supplies from the
 *   GenCo side (both already summed into M300-P1-004/M300-P1-005 via
 *   ingest-niso-generation-kpis.ts). Ingesting this too would double-count
 *   the same energy under a second KPI.
 * - No sheet gives cross-border interconnector capacity in MW (only line
 *   length and voltage, which cannot honestly be converted to a thermal
 *   MW rating) - M300-P5-001 stays "no data yet" pending a real source.
 *
 * The "as-of snapshot" sheets (line/substation, pipeline capacity,
 * cross-border length) carry no period column in the source, so each is
 * written once under the quarter this script runs in - re-running it
 * later with an unchanged sheet updates that KpiValue in place rather than
 * accumulating a new one every run.
 *
 * Idempotent: deterministic ids derived from (kpiCode, period).
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-niso-remaining-sheets.js
 */

const NISO_WORKBOOK = join(process.cwd(), "prisma", "data", "niso-compiled-data-2020-2026.xlsx");
const SOURCE_REFERENCE_BASE = "EMRC - NISO Compiled Data 2020-2026 v1 2026-09-11.xlsx";
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

function approvedAtForQuarter(period: string): Date {
  const match = /^q([1-4])-(\d{4})$/.exec(period);
  if (!match) throw new Error(`Cannot derive a date from period "${period}".`);
  const [month, day] = QUARTER_END_MONTH_DAY[Number(match[1])];
  return new Date(Date.UTC(Number(match[2]), month, day));
}

function approvedAtForYear(year: string): Date {
  return new Date(Date.UTC(Number(year), 11, 31));
}

function currentSnapshotPeriod(): string {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `q${quarter}-${now.getUTCFullYear()}`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "");
  }
  return String(value).trim();
}

async function main() {
  console.log(`Reading workbook: ${NISO_WORKBOOK}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(NISO_WORKBOOK);

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

  async function backfillOne(
    kpiCode: string,
    period: string,
    value: number,
    detail: string,
    approvedAt: Date,
  ) {
    const kpi = await prisma.kpiDefinition.findUnique({ where: { code: kpiCode } });
    if (!kpi) throw new Error(`KPI ${kpiCode} not found - run ingest-kpi-directory.js first.`);

    const submissionId = `niso-remaining-submission-${kpiCode}-${period}`;
    const itemId = `niso-remaining-item-${kpiCode}-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "UPLOAD",
        status: "APPROVED",
        sourceReference: `${SOURCE_REFERENCE_BASE} (${detail})`,
        notes: "Backfilled by ingest-niso-remaining-sheets.ts, not submitted through the live review queue.",
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
          comment: "Historical bulk import - approved as part of the NISO remaining-sheets backfill.",
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
        approvedAt,
      },
      update: { value, approvedAt },
    });
  }

  let written = 0;
  const snapshotPeriod = currentSnapshotPeriod();
  const snapshotApprovedAt = approvedAtForQuarter(snapshotPeriod);

  // --- Export Revenue Collected (M300-P5-003) ----------------------------
  const bilateralUsd = workbook.getWorksheet("Bilateral_Inv_Pay_USD");
  if (!bilateralUsd) throw new Error('Sheet "Bilateral_Inv_Pay_USD" not found.');
  const revenueByQuarter = new Map<string, { invoiced: number; paid: number; months: Set<string> }>();
  bilateralUsd.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const year = Number(row.getCell(1).value);
    const month = cellText(row.getCell(2).value);
    const invoiced = Number(row.getCell(5).value) || 0;
    const paid = Number(row.getCell(6).value) || 0;
    const quarter = MONTH_TO_QUARTER[month];
    if (!year || !quarter) return;
    const period = `q${quarter}-${year}`;
    const totals = revenueByQuarter.get(period) ?? { invoiced: 0, paid: 0, months: new Set<string>() };
    totals.invoiced += invoiced;
    totals.paid += paid;
    totals.months.add(month);
    revenueByQuarter.set(period, totals);
  });
  for (const [period, totals] of revenueByQuarter) {
    if (totals.months.size < 3 || totals.invoiced <= 0) continue;
    const collectionRate = (totals.paid / totals.invoiced) * 100;
    await backfillOne(
      "M300-P5-003",
      period,
      collectionRate,
      "Bilateral_Inv_Pay_USD: payment / invoice across 6 cross-border export contracts (NIGELEC, CEET, SBPE)",
      approvedAtForQuarter(period),
    );
    written++;
  }

  // --- Transmission line length & substation capacity (snapshot) --------
  const tnxSheet = workbook.getWorksheet("TnxLine & Susbstation Capacity");
  if (!tnxSheet) throw new Error('Sheet "TnxLine & Susbstation Capacity" not found.');
  let lineLengthKm = 0;
  let substationMva = 0;
  tnxSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const indicator = cellText(row.getCell(1).value);
    const value = Number(row.getCell(3).value) || 0;
    if (indicator === "Transmission Line Length") lineLengthKm += value;
    else if (indicator === "Installed Substation Capacity") substationMva += value;
  });
  if (lineLengthKm > 0) {
    await backfillOne(
      "M300-P1-017",
      snapshotPeriod,
      lineLengthKm,
      "TnxLine & Susbstation Capacity: sum of 330kV + 132kV line length",
      snapshotApprovedAt,
    );
    written++;
  }
  if (substationMva > 0) {
    await backfillOne(
      "M300-P1-018",
      snapshotPeriod,
      substationMva,
      "TnxLine & Susbstation Capacity: sum of 330/132kV + 132/33kV substation capacity",
      snapshotApprovedAt,
    );
    written++;
  }

  // --- Planned generation capacity pipeline (snapshot) -------------------
  const plannedSheet = workbook.getWorksheet("Planned Gen Capacity");
  if (!plannedSheet) throw new Error('Sheet "Planned Gen Capacity" not found.');
  let committedMw = 0;
  let candidateMw = 0;
  plannedSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const capacity = Number(row.getCell(3).value) || 0;
    const status = cellText(row.getCell(4).value);
    if (status === "Committed") committedMw += capacity;
    else if (status === "Candidate") candidateMw += capacity;
  });
  if (committedMw > 0) {
    await backfillOne(
      "M300-P1-019",
      snapshotPeriod,
      committedMw,
      "Planned Gen Capacity: sum of nameplate MW where STATUS = Committed",
      snapshotApprovedAt,
    );
    written++;
  }
  if (candidateMw > 0) {
    await backfillOne(
      "M300-P1-020",
      snapshotPeriod,
      candidateMw,
      "Planned Gen Capacity: sum of nameplate MW where STATUS = Candidate",
      snapshotApprovedAt,
    );
    written++;
  }

  // --- Cross-border transmission line length (snapshot) -------------------
  const crossBorderSheet = workbook.getWorksheet("Cross-border connections");
  if (!crossBorderSheet) throw new Error('Sheet "Cross-border connections" not found.');
  let crossBorderKm = 0;
  crossBorderSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    crossBorderKm += Number(row.getCell(6).value) || 0;
  });
  if (crossBorderKm > 0) {
    await backfillOne(
      "M300-P5-006",
      snapshotPeriod,
      crossBorderKm,
      "Cross-border connections: sum of line length across all 3 recorded interconnectors",
      snapshotApprovedAt,
    );
    written++;
  }

  // --- National peak demand forecast (per year, explicitly a forecast) ---
  const demandSheet = workbook.getWorksheet("National Demand Forecast");
  if (!demandSheet) throw new Error('Sheet "National Demand Forecast" not found.');
  const demandByYear: { year: string; demand: number }[] = [];
  demandSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const year = String(row.getCell(1).value ?? "").trim();
    const demand = Number(row.getCell(2).value) || 0;
    if (!/^\d{4}$/.test(year) || demand <= 0) return;
    demandByYear.push({ year, demand });
  });
  for (const { year, demand } of demandByYear) {
    await backfillOne(
      "M300-PX-014",
      year,
      demand,
      "National Demand Forecast: NISO's own peak-demand projection (documented base case: 4% annual growth)",
      approvedAtForYear(year),
    );
    written++;
  }

  console.log(`KpiValue backfill complete: ${written} values across 6 KPIs.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
