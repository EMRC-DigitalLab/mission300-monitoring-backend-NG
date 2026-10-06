import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { addMonth, commonMonths, coverageNoteFor, quarterOfMonth } from "./lib/period-coverage";

const WORKBOOK_PATH = join(process.cwd(), "prisma", "data", "nerc-disco-data-2020-2026.xlsx");
const FLOW_SHEETS = ["Disco Energy Recieved", "Disco Energy Billed", "Disco Revenue Billed", "Disco Revenue Collected"];
const ADDITIVE_KPIS = ["M300-P3-007"];

function monthsBySheet(workbook: ExcelJS.Workbook, sheetName: string) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in workbook.`);

  const months = new Map<string, Set<string>>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const year = Number(row.getCell(3).value);
    const month = String(row.getCell(4).value ?? "").trim();
    const value = Number(row.getCell(5).value);
    const quarter = quarterOfMonth(month);
    if (quarter && year && Number.isFinite(value) && value > 0) addMonth(months, `q${quarter}-${year}`, month);
  });
  return months;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);

  const coverage = commonMonths(FLOW_SHEETS.map((name) => monthsBySheet(workbook, name)));
  const notes = new Map<string, string>();
  for (const [period, months] of coverage) {
    const note = coverageNoteFor(period, months);
    if (note) notes.set(period, note);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  console.log(dryRun ? "DRY RUN - nothing written\n" : "Applied\n");
  console.log("Incomplete quarters in the NERC workbook (revenue and energy):");
  for (const [period, note] of notes) console.log(`  ${period}: ${note}`);
  if (notes.size === 0) console.log("  none");

  const differsFrom = (note: string | null) =>
    note === null ? { coverageNote: { not: null } } : { OR: [{ coverageNote: null }, { coverageNote: { not: note } }] };

  let records = 0;
  let values = 0;
  const allPeriods = await prisma.discoPerformanceRecord.findMany({ distinct: ["period"], select: { period: true } });
  for (const { period } of allPeriods) {
    const note = notes.get(period) ?? null;

    const recordWhere = { period, ...differsFrom(note) };
    records += await prisma.discoPerformanceRecord.count({ where: recordWhere });
    if (!dryRun) await prisma.discoPerformanceRecord.updateMany({ where: recordWhere, data: { coverageNote: note } });

    for (const code of ADDITIVE_KPIS) {
      const valueWhere = { period, kpiDefinition: { code }, ...differsFrom(note) };
      values += await prisma.kpiValue.count({ where: valueWhere });
      if (!dryRun) await prisma.kpiValue.updateMany({ where: valueWhere, data: { coverageNote: note } });
    }
  }

  console.log(`\nDisCo records changed: ${records}`);
  console.log(`KPI values changed (${ADDITIVE_KPIS.join(", ")}): ${values}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
