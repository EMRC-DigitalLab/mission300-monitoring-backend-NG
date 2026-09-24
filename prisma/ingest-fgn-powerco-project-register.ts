import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const WORKBOOK_PATH = join(process.cwd(), "prisma", "data", "fgn-powerco-project-register.xlsx");
const EVIDENCE_ORIGINAL_NAME = "FGN PowerCO Project Register.xlsx";

const PROGRAMME_ID = "fgn-powerco-ppi-programme";
const LEAD_INSTITUTION = "FGN Power Company (FGN PowerCO)";
const PILLAR_SLUG = "generation-network";

type ExecutionStatus = "ON_TRACK" | "AT_RISK";
type LifecycleStage = "IDENTIFICATION" | "PROCUREMENT" | "IMPLEMENTATION";
type FundingStatus = "COMMITTED" | "UNFUNDED";
type ProgramType = "GOVERNMENT_FUNDED" | "BLENDED_FINANCE";

interface ProjectRow {
  programme: string;
  project: string;
  completionDateRaw: string;
  projectedStatusRaw: string;
  currentStatusRaw: string;
  comment: string;
  suggestion: string;
  programTypeRaw: string;
  fundingCell: string;
  amountCell: string;
  fundingStatusRaw: string;
}

interface Amounts {
  usd: number;
  text: string;
}

function cellString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "").trim();
  }
  if (typeof value === "number" && /€|\[\$.-2\]/.test(cell.numFmt ?? "")) {
    return `€ ${value.toLocaleString("en-US")}`;
  }
  return String(value).trim();
}

function projectId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 8);
  return `fgn-powerco-project-${slug}-${hash}`;
}

function stripFootnoteMarkers(raw: string): { text: string; notes: string[] } {
  const notes = [...raw.matchAll(/\[(\d+)\]/g)].map((match) => match[1]);
  return { text: raw.replace(/\[\d+\]/g, "").trim(), notes };
}

function parseCompletionDate(raw: string): Date | null {
  const years = raw.match(/\d{4}/g);
  if (!years) return null;
  return new Date(Date.UTC(Number(years[years.length - 1]), 11, 31));
}

function toProjectedStatus(raw: string): ExecutionStatus {
  return /awaiting fec/i.test(raw) ? "AT_RISK" : "ON_TRACK";
}

function toCurrentStatus(raw: string, comment: string): ExecutionStatus {
  return /financing risk|awaiting fec/i.test(`${raw} ${comment}`) ? "AT_RISK" : "ON_TRACK";
}

function toLifecycle(projectedRaw: string, currentRaw: string): LifecycleStage {
  if (/ongoing/i.test(currentRaw)) return "IMPLEMENTATION";
  if (/ytc/i.test(`${projectedRaw} ${currentRaw}`)) return "IDENTIFICATION";
  return "PROCUREMENT";
}

function parseAmounts(raw: string): Amounts {
  let usd = 0;
  let onlyUsd = true;
  const parts: string[] = [];
  for (const match of raw.matchAll(/(N|₦|\$|€)\s*([\d,]+(?:\.\d+)?)/g)) {
    const symbol = match[1];
    const value = Number(match[2].replace(/,/g, ""));
    if (symbol === "$") usd += value;
    else onlyUsd = false;
    parts.push(`${symbol === "N" ? "₦" : symbol}${match[2]}`);
  }
  return { usd: onlyUsd ? usd : 0, text: parts.join(" and ") };
}

function readRegister(workbook: ExcelJS.Workbook): { rows: ProjectRow[]; footnotes: Map<string, string> } {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no sheets.");

  const rows: ProjectRow[] = [];
  const footnotes = new Map<string, string>();
  let programme = "";
  let current: ProjectRow | null = null;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const first = cellString(row.getCell(1));
    const footnote = /^\[(\d+)\]\s*(.*)$/.exec(first);
    if (footnote) {
      footnotes.set(footnote[1], footnote[2].trim());
      return;
    }
    const project = cellString(row.getCell(2));
    if (project) {
      if (first) programme = first;
      current = {
        programme,
        project,
        completionDateRaw: cellString(row.getCell(4)),
        projectedStatusRaw: cellString(row.getCell(5)),
        currentStatusRaw: cellString(row.getCell(6)),
        comment: cellString(row.getCell(7)),
        suggestion: cellString(row.getCell(8)),
        programTypeRaw: cellString(row.getCell(9)),
        fundingCell: cellString(row.getCell(10)),
        amountCell: "",
        fundingStatusRaw: cellString(row.getCell(11)),
      };
      rows.push(current);
      return;
    }
    const amount = cellString(row.getCell(10));
    if (current && amount && !current.amountCell) current.amountCell = amount;
  });
  return { rows, footnotes };
}

async function main() {
  console.log(`Reading workbook: ${WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const { rows, footnotes } = readRegister(workbook);
  console.log(`Project rows read: ${rows.length}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");

  const pillar = await prisma.pillar.findUnique({ where: { slug: PILLAR_SLUG } });
  if (!pillar) throw new Error(`Pillar "${PILLAR_SLUG}" not found - run ingest-kpi-directory.js first.`);

  const workbookBuffer = await readFile(WORKBOOK_PATH);
  let uploadedFile = await prisma.uploadedFile.findFirst({
    where: { originalName: EVIDENCE_ORIGINAL_NAME, size: workbookBuffer.byteLength },
    orderBy: { createdAt: "asc" },
  });
  if (!uploadedFile) {
    const storageRoot = process.env.STORAGE_LOCAL_PATH ?? "./storage";
    await mkdir(join(storageRoot, "uploads"), { recursive: true });
    const storageKey = join("uploads", `${randomUUID()}.xlsx`);
    await writeFile(join(storageRoot, storageKey), workbookBuffer);
    uploadedFile = await prisma.uploadedFile.create({
      data: {
        uploadedById: admin.id,
        storageKey,
        originalName: EVIDENCE_ORIGINAL_NAME,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: workbookBuffer.byteLength,
      },
    });
  }

  const programmeName = rows[0]?.programme || "Presidential Power Initiative (PPI)";
  const programmeEndYear = Math.max(
    ...rows.map((row) => parseCompletionDate(row.completionDateRaw)?.getUTCFullYear() ?? 0),
    2030,
  );
  const financing = footnotes.get("1") ?? null;
  const programme = await prisma.programme.upsert({
    where: { id: PROGRAMME_ID },
    create: {
      id: PROGRAMME_ID,
      name: programmeName,
      leadInstitution: LEAD_INSTITUTION,
      supportingInstitutions: [],
      pillarId: pillar.id,
      objectives: "Transmission substation and line projects delivered under the Presidential Power Initiative.",
      financing,
      status: "ON_TRACK",
      priority: "PRIORITY",
      startDate: new Date(),
      endDate: new Date(Date.UTC(programmeEndYear, 11, 31)),
      bottleneckCategory: null,
      validationStatus: "PUBLIC_SOURCE",
    },
    update: { financing },
  });
  console.log(`Programme upserted: ${programme.id}`);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const id = projectId(row.project);
    const projected = stripFootnoteMarkers(row.projectedStatusRaw);
    const current = stripFootnoteMarkers(row.currentStatusRaw);
    const rowNotes = [...new Set([...projected.notes, ...current.notes])];

    const [sourceRaw, ...inlineAmount] = row.fundingCell.split("/");
    const fundingSource = sourceRaw.trim() || null;
    const amounts = parseAmounts(row.amountCell || inlineAmount.join("/"));

    const fundingStatusText = row.fundingStatusRaw.trim();
    const fundingStatus: FundingStatus = /^secured/i.test(fundingStatusText) ? "COMMITTED" : "UNFUNDED";
    const programType: ProgramType = /financing/i.test(fundingSource ?? "") ? "BLENDED_FINANCE" : "GOVERNMENT_FUNDED";
    const lifecycleStage = toLifecycle(projected.text, current.text);

    const comment = [
      row.comment,
      projected.text && !/^on track$/i.test(projected.text) ? `Projected status: ${projected.text}.` : "",
      ...rowNotes.map((note) => footnotes.get(note) ?? ""),
    ]
      .filter(Boolean)
      .join(" ");

    const data = {
      programmeId: programme.id,
      name: row.project,
      owner: LEAD_INSTITUTION,
      leadName: "FGN PowerCO Project Delivery",
      location: "National",
      latitude: 0,
      longitude: 0,
      coverage: "National",
      pillarId: pillar.id,
      stateId: null,
      lifecycleStage,
      programType,
      fundingSource,
      fundingStructure:
        [fundingSource, amounts.text, fundingStatusText].filter(Boolean).join(" - ") || "To be confirmed",
      fundingStatus,
      pipelineReadiness: lifecycleStage === "IDENTIFICATION" ? ("INVESTMENT_READY" as const) : null,
      projectedStatus: toProjectedStatus(projected.text),
      currentStatus: toCurrentStatus(current.text, row.comment),
      startDate: new Date(),
      endDate: parseCompletionDate(row.completionDateRaw),
      evidenceUrl: uploadedFile.id,
      bottleneckCategory: /financing/i.test(row.comment) ? ("FINANCING" as const) : null,
      comment,
      suggestion: row.suggestion,
      validationStatus: "PUBLIC_SOURCE" as const,
      description: row.programTypeRaw ? `${row.programTypeRaw} project under ${programmeName}.` : "",
      budgetUsd: amounts.usd,
      disbursedUsd: 0,
      contractor: null,
      contactName: "FGN PowerCO Project Delivery",
      contactEmail: "unassigned@example.gov.ng",
    };

    const existing = await prisma.project.findUnique({ where: { id } });
    await prisma.project.upsert({ where: { id }, create: { id, ...data }, update: data });
    if (existing) updated++;
    else created++;
  }

  console.log(`Project: ${created} created, ${updated} updated, ${rows.length} total.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
