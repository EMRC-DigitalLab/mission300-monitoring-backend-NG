import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { discoInstitutionId, resolveDiscoName } from "./lib/disco-institutions";
import { quarterEndCustomerStocks, type CustomerStock, type MeteringRow } from "./lib/nerc-customer-stocks";

const WORKBOOK_PATH = join(process.cwd(), "prisma", "data", "nerc-disco-data-2020-2026.xlsx");

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

async function readMeteringRows(): Promise<MeteringRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const sheet = workbook.getWorksheet("Disco Metering");
  if (!sheet) throw new Error(`Sheet "Disco Metering" not found in workbook.`);

  const rows: MeteringRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const disco = cellString(row.getCell(1).value);
    const customerType = cellString(row.getCell(2).value);
    const date = row.getCell(3).value;
    const count = cellNumber(row.getCell(5).value);
    if (!disco || !(date instanceof Date)) return;
    rows.push({ disco, customerType, date, count });
  });
  return rows;
}

const format = (value: number) => value.toLocaleString("en-US");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const stocksByPeriod = quarterEndCustomerStocks(await readMeteringRows());

  const stockByInstitution = new Map<string, Map<string, CustomerStock>>();
  const unknownDiscoNames = new Set<string>();
  for (const [period, snapshot] of stocksByPeriod) {
    const byInstitution = new Map<string, CustomerStock>();
    for (const [rawDisco, stock] of snapshot.byDisco) {
      const canonicalDisco = resolveDiscoName(rawDisco);
      if (!canonicalDisco) {
        unknownDiscoNames.add(rawDisco);
        continue;
      }
      byInstitution.set(discoInstitutionId(canonicalDisco), stock);
    }
    stockByInstitution.set(period, byInstitution);
  }
  if (unknownDiscoNames.size > 0) {
    throw new Error(`Unrecognized DisCo name(s) in workbook: ${[...unknownDiscoNames].join(", ")}`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });
  const records = await prisma.discoPerformanceRecord.findMany({ orderBy: [{ period: "asc" }] });

  const national = new Map<string, { beforeActive: number; afterActive: number; beforeMetered: number; afterMetered: number }>();
  let corrected = 0;
  let alreadyCorrect = 0;

  for (const record of records) {
    const byInstitution = stockByInstitution.get(record.period);
    if (!byInstitution) continue;

    const stock = byInstitution.get(record.institutionId) ?? { metered: 0, unmetered: 0 };
    const activeCustomers = stock.metered + stock.unmetered;
    const meteredCustomers = stock.metered;

    const totals = national.get(record.period) ?? {
      beforeActive: 0,
      afterActive: 0,
      beforeMetered: 0,
      afterMetered: 0,
    };
    totals.beforeActive += record.activeCustomers;
    totals.afterActive += activeCustomers;
    totals.beforeMetered += record.meteredCustomers;
    totals.afterMetered += meteredCustomers;
    national.set(record.period, totals);

    if (record.activeCustomers === activeCustomers && record.meteredCustomers === meteredCustomers) {
      alreadyCorrect++;
      continue;
    }

    corrected++;
    if (!dryRun) {
      await prisma.discoPerformanceRecord.update({
        where: { id: record.id },
        data: { activeCustomers, meteredCustomers },
      });
    }
  }

  console.log(dryRun ? "DRY RUN - nothing written\n" : "Applied\n");
  console.log("Quarters whose national customer totals change:");
  for (const [period, totals] of national) {
    if (totals.beforeActive === totals.afterActive && totals.beforeMetered === totals.afterMetered) continue;
    const snapshotDate = stocksByPeriod.get(period)?.snapshotDate.toISOString().slice(0, 10);
    console.log(
      `  ${period} (as of ${snapshotDate}): active ${format(totals.beforeActive)} -> ${format(totals.afterActive)}, ` +
        `metered ${format(totals.beforeMetered)} -> ${format(totals.afterMetered)}`,
    );
  }
  console.log(`\nDisCo records corrected: ${corrected}, already correct: ${alreadyCorrect}`);
  console.log(
    "\nNext: re-run ingest-national-rollup-kpis and ingest-derived-utility-kpis so M300-P1-001, P3-001, P3-002, P3-003 and P3-004 are rebuilt from the corrected records.",
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
