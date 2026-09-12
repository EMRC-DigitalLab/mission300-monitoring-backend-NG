import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * One-off historical backfill of M300-P3-012 ("Current Cost-Reflective
 * Tariff") from the "Disco Allowed Tariffs" sheet in the same compiled
 * NERC workbook the other two backfills use.
 *
 * That sheet gives ONE blended tariff per DisCo per YEAR (no per-band
 * breakdown - confirmed the Month column is always "NULL", so this is
 * annual, not monthly), which doesn't map to DiscoServiceBand (needs
 * tariff AND customer-share split by service band A-E, neither of which
 * this sheet has). Rather than force it into that shape - which would
 * mean inventing a customer-distribution-per-band number with no real
 * source - this rolls the per-DisCo figures up into the one real KPI that
 * already exists for a national tariff figure, weighted by each DisCo's
 * real active-customer count for that year (from DiscoPerformanceRecord,
 * already ingested by ingest-nerc-disco-data.ts - this script depends on
 * that having run first and fails clearly if it hasn't).
 *
 * Same KpiValue-via-Submission-chain approach as
 * ingest-nerc-genco-kpis.ts (see that file's header comment for why a
 * KpiValue can't just be written directly) - reuses the same "NISO / TCN"
 * pattern but attributes this data to NERC itself, since MYTO tariff
 * orders are NERC's own determination, not a generation-side figure.
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-nerc-tariff-kpi.js
 * (after ingest-nerc-disco-data.js has already run against the same DB)
 */

const WORKBOOK_PATH = join(process.cwd(), "prisma", "data", "nerc-disco-data-2020-2026.xlsx");

const NERC_INSTITUTION_ID = "seed-institution-nerc";
const NERC_INSTITUTION_NAME = "Nigerian Electricity Regulatory Commission (NERC)";

const TARIFF_KPI_CODE = "M300-P3-012";

// Same normalization table as ingest-nerc-disco-data.ts (duplicated
// deliberately - these are small, stable, standalone one-off scripts, not
// shared application code, so copying ~15 lines is lower-risk than
// coupling them together).
const DISCO_NAME_MAP: Record<string, string> = {
  Aba: "Aba Power Limited",
  Abuja: "Abuja Electricity Distribution Company",
  Benin: "Benin Electricity Distribution Company",
  Eko: "Eko Electricity Distribution Company",
  Enugu: "Enugu Electricity Distribution Company",
  Ibadan: "Ibadan Electricity Distribution Company",
  Ikeja: "Ikeja Electric",
  Jos: "Jos Electricity Distribution Company",
  Kaduna: "Kaduna Electricity Distribution Company",
  Kano: "Kano Electricity Distribution Company",
  PH: "Port Harcourt Electricity Distribution Company",
  "Port Harcourt": "Port Harcourt Electricity Distribution Company",
  Portharcourt: "Port Harcourt Electricity Distribution Company",
  Yola: "Yola Electricity Distribution Company",
};
const DISCO_NAME_MAP_LOWER = new Map(
  Object.entries(DISCO_NAME_MAP).map(([raw, canonical]) => [raw.toLowerCase(), canonical]),
);
function resolveDiscoName(raw: string): string | undefined {
  return DISCO_NAME_MAP_LOWER.get(raw.trim().toLowerCase());
}
function discoInstitutionId(fullName: string): string {
  return `seed-disco-${fullName.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "");
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined || value === "" || value === "NULL") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function approvedAtForYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31));
}

/** Reads "Disco Allowed Tariffs" (Disco, Year, Month["NULL" always],
 * AllowedTariffs_N_kWh) into a per-DisCo-per-year map, deduped by
 * (normalized name, year) the same way the other sheets are. */
function readAllowedTariffs(workbook: ExcelJS.Workbook): Map<string, Map<number, number>> {
  const sheet = workbook.getWorksheet("Disco Allowed Tariffs");
  if (!sheet) throw new Error('Sheet "Disco Allowed Tariffs" not found.');

  const byDisco = new Map<string, Map<number, number>>();
  const unknownDiscoNames = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rawDisco = cellString(row.getCell(1).value);
    const year = cellNumber(row.getCell(2).value);
    const tariff = cellNumber(row.getCell(4).value);
    if (!rawDisco || !year || !tariff) return;

    const canonical = resolveDiscoName(rawDisco);
    if (!canonical) {
      unknownDiscoNames.add(rawDisco);
      return;
    }
    const byYear = byDisco.get(canonical) ?? new Map<number, number>();
    if (!byYear.has(year)) byYear.set(year, tariff);
    byDisco.set(canonical, byYear);
  });

  if (unknownDiscoNames.size > 0) {
    throw new Error(`Unrecognized DisCo name(s) in "Disco Allowed Tariffs": ${[...unknownDiscoNames].join(", ")}`);
  }
  return byDisco;
}

async function main() {
  console.log(`Reading workbook: ${WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);

  const tariffsByDiscoYear = readAllowedTariffs(workbook);
  console.log(`Tariffs read for ${tariffsByDiscoYear.size} DisCos.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const kpi = await prisma.kpiDefinition.findUnique({ where: { code: TARIFF_KPI_CODE } });
  if (!kpi) throw new Error(`KPI ${TARIFF_KPI_CODE} not found - run the KPI directory ingestion first.`);

  const institution = await prisma.institution.upsert({
    where: { id: NERC_INSTITUTION_ID },
    create: { id: NERC_INSTITUTION_ID, name: NERC_INSTITUTION_NAME, type: "Regulator" },
    update: {},
  });

  const admin = await prisma.user.findFirst({ where: { role: "SYSTEM_ADMINISTRATOR" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found to attribute the backfilled submissions to.");
  const adminId = admin.id;

  const EVIDENCE_ORIGINAL_NAME = "Compiled NERC Data 2020 - 2026.xlsx";
  const uploadedFile = await prisma.uploadedFile.findFirst({
    where: { originalName: EVIDENCE_ORIGINAL_NAME },
    orderBy: { createdAt: "asc" },
  });
  if (!uploadedFile) {
    throw new Error(
      "No stored evidence file found for the NERC workbook - run ingest-nerc-disco-data.js (or ingest-nerc-genco-kpis.js) against this database first.",
    );
  }

  // Real weight per DisCo per year: that DisCo's active-customer count at
  // year-end (Q4), from the already-ingested DiscoPerformanceRecord - not
  // a real one-off invented weight, and not a plain unweighted average
  // (which would let a small DisCo's tariff move the "national" figure as
  // much as a large one).
  const years = new Set<number>();
  for (const byYear of tariffsByDiscoYear.values()) {
    for (const year of byYear.keys()) years.add(year);
  }

  let backfilled = 0;
  let skippedForNoWeights = 0;

  for (const year of years) {
    const q4Period = `q4-${year}`;
    let weightedSum = 0;
    let totalWeight = 0;
    const missingWeights: string[] = [];

    for (const [discoName, byYear] of tariffsByDiscoYear) {
      const tariff = byYear.get(year);
      if (tariff === undefined) continue;

      const institutionId = discoInstitutionId(discoName);
      const record = await prisma.discoPerformanceRecord.findUnique({
        where: { institutionId_period: { institutionId, period: q4Period } },
      });
      if (!record || record.activeCustomers <= 0) {
        missingWeights.push(discoName);
        continue;
      }
      weightedSum += tariff * record.activeCustomers;
      totalWeight += record.activeCustomers;
    }

    if (totalWeight === 0) {
      console.log(`${year}: skipped - no DisCo has both a tariff and a real ${q4Period} customer count.`);
      skippedForNoWeights++;
      continue;
    }
    if (missingWeights.length > 0) {
      console.log(`${year}: ${missingWeights.length} DisCo(s) had a tariff but no ${q4Period} customer count, excluded from the weighted average: ${missingWeights.join(", ")}`);
    }

    const nationalTariff = weightedSum / totalWeight;
    const period = String(year);
    const submissionId = `nerc-tariff-submission-${period}`;
    const itemId = `nerc-tariff-item-${period}`;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        institutionId: institution.id,
        submittedById: adminId,
        method: "UPLOAD",
        status: "APPROVED",
        sourceFileUrl: uploadedFile.storageKey,
        originalFileName: uploadedFile.originalName,
        sourceReference: "Historical bulk import - Compiled NERC Data 2020-2026 (customer-weighted national average of per-DisCo allowed tariffs)",
        notes: "Backfilled by ingest-nerc-tariff-kpi.ts, not submitted through the live review queue.",
        reviewerId: adminId,
      },
      update: {},
    });

    await prisma.submissionItem.upsert({
      where: { id: itemId },
      create: { id: itemId, submissionId, kpiDefinitionId: kpi.id, period, value: nationalTariff },
      update: { value: nationalTariff },
    });

    const existingDecision = await prisma.reviewDecision.findFirst({ where: { submissionId } });
    if (!existingDecision) {
      await prisma.reviewDecision.create({
        data: {
          submissionId,
          reviewedById: adminId,
          decision: "APPROVE",
          comment: "Historical bulk import - approved as part of the NERC data backfill.",
        },
      });
    }

    await prisma.kpiValue.upsert({
      where: { sourceSubmissionItemId: itemId },
      create: {
        kpiDefinitionId: kpi.id,
        institutionId: institution.id,
        period,
        value: nationalTariff,
        sourceSubmissionItemId: itemId,
        approvedAt: approvedAtForYear(year),
      },
      update: { value: nationalTariff, approvedAt: approvedAtForYear(year) },
    });

    backfilled++;
  }

  console.log(`Tariff KPI backfill complete: ${backfilled} year(s) backfilled, ${skippedForNoWeights} skipped for lack of weights.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
