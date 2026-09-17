import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Ingests the "Project Register" sheet of "EMRC - NISO Compiled Data
 * 2020-2026 v1 2026-09-11.xlsx" (m300-frontend/docs/) - NISO's own project
 * register, the generation-and-network counterpart to the REA register
 * handled by ingest-rea-project-register.ts.
 *
 * Most rows in this register carry no projected completion date, no funding
 * information and no comment. Project.endDate is nullable precisely for
 * this case (see its schema comment and the 20260913230000 migration): a
 * placeholder date would render in the delivery tables as a real committed
 * deadline. Everything not present in the sheet is left null or at the same
 * defaults the quick-add form uses, never invented:
 *
 * - endDate: null unless the sheet states a projected completion date.
 * - startDate: today, matching ProgramsService.createProject's own default
 *   for an unstated start date.
 * - latitude/longitude 0,0, coverage/fundingStructure "To be confirmed",
 *   budget/disbursed 0, contractor null, leadName/contactName a role rather
 *   than an invented person, contactEmail the quick-add placeholder.
 * - stateId null - the schema is explicit that "not yet tagged" beats
 *   guessing a state from free text.
 *
 * The sheet's status column is free text with progress notes ("Ongoing -
 * 35%", "Completed - 100% as of July 2026"). The leading word maps to
 * ExecutionStatus and the full original string is preserved in `comment`,
 * so the percentage detail is not lost.
 *
 * Idempotent: deterministic ids derived from the project name.
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-niso-project-register.js
 */

const WORKBOOK_PATH = join(
  process.cwd(),
  "..",
  "emrc-geapp",
  "docs",
  "EMRC - NISO Compiled Data 2020-2026 v1 2026-09-11.xlsx",
);
const EVIDENCE_ORIGINAL_NAME = "EMRC - NISO Compiled Data 2020-2026 v1 2026-09-11.xlsx";

const PROGRAMME_ID = "niso-systems-planning-programme";
const NISO_LEAD_INSTITUTION = "Nigerian Independent System Operator (NISO)";

const PILLAR_BY_SHEET_LABEL: Record<string, string> = {
  "Pillar 1: Rehabilitation and Expansion of Energy Infrastructure": "generation-network",
  "Pillar 4: Private Sector Participation": "private-sector-participation",
};

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "");
  }
  return String(value).trim();
}

function projectId(name: string): string {
  return `niso-project-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80)}`;
}

function toExecutionStatus(raw: string): "COMPLETED" | "ON_TRACK" {
  return /^completed/i.test(raw.trim()) ? "COMPLETED" : "ON_TRACK";
}

function parseCompletionDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  if (iso) return new Date(trimmed);

  const monthYear = /([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (monthYear) {
    const monthIndex = new Date(`${monthYear[1]} 1, 2000`).getMonth();
    if (!Number.isNaN(monthIndex)) {
      const year = Number(monthYear[2]);
      const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      return new Date(Date.UTC(year, monthIndex, lastDay));
    }
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) return new Date(Date.UTC(Number(yearOnly[1]), 11, 31));

  return null;
}

interface ProjectRow {
  programme: string;
  project: string;
  pillarLabel: string;
  completionDateRaw: string;
  currentStatusRaw: string;
  comment: string;
  suggestion: string;
  fundingSource: string;
  fundingStatusRaw: string;
}

function readRegister(workbook: ExcelJS.Workbook): ProjectRow[] {
  const sheet = workbook.getWorksheet("Project Register");
  if (!sheet) throw new Error('Sheet "Project Register" not found.');

  const rows: ProjectRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return;
    const project = cellString(row.getCell(2).value);
    if (!project) return;
    rows.push({
      programme: cellString(row.getCell(1).value),
      project,
      pillarLabel: cellString(row.getCell(3).value),
      completionDateRaw: cellString(row.getCell(4).value),
      currentStatusRaw: cellString(row.getCell(6).value),
      comment: cellString(row.getCell(7).value),
      suggestion: cellString(row.getCell(8).value),
      fundingSource: cellString(row.getCell(10).value),
      fundingStatusRaw: cellString(row.getCell(11).value),
    });
  });
  return rows;
}

async function main() {
  console.log(`Reading workbook: ${WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const rows = readRegister(workbook);
  console.log(`Project rows read: ${rows.length}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found.");

  const pillarsBySlug = new Map<string, string>();
  for (const slug of new Set(Object.values(PILLAR_BY_SHEET_LABEL))) {
    const pillar = await prisma.pillar.findUnique({ where: { slug } });
    if (!pillar) throw new Error(`Pillar "${slug}" not found - run ingest-kpi-directory.js first.`);
    pillarsBySlug.set(slug, pillar.id);
  }

  const workbookBuffer = await readFile(WORKBOOK_PATH);
  let uploadedFile = await prisma.uploadedFile.findFirst({
    where: { originalName: EVIDENCE_ORIGINAL_NAME, size: workbookBuffer.byteLength },
    orderBy: { createdAt: "asc" },
  });
  if (!uploadedFile) {
    const storageRoot = process.env.STORAGE_LOCAL_PATH ?? "./storage";
    const storageDir = join(storageRoot, "uploads");
    await mkdir(storageDir, { recursive: true });
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

  const programmePillar = pillarsBySlug.get("generation-network")!;
  const programme = await prisma.programme.upsert({
    where: { id: PROGRAMME_ID },
    create: {
      id: PROGRAMME_ID,
      name: rows[0]?.programme || "NISO Systems Planning Directorate",
      leadInstitution: NISO_LEAD_INSTITUTION,
      supportingInstitutions: [],
      pillarId: programmePillar,
      objectives:
        "System planning, network studies and transmission expansion analysis carried out by the Nigerian Independent System Operator.",
      financing: null,
      status: "ON_TRACK",
      priority: "PRIORITY",
      startDate: new Date(),
      endDate: new Date(Date.UTC(2030, 11, 31)),
      bottleneckCategory: null,
      validationStatus: "PUBLIC_SOURCE",
    },
    update: {},
  });
  console.log(`Programme upserted: ${programme.id}`);

  let created = 0;
  let updated = 0;
  let withoutDate = 0;

  for (const row of rows) {
    const pillarSlug = PILLAR_BY_SHEET_LABEL[row.pillarLabel];
    if (!pillarSlug) throw new Error(`Unmapped pillar label "${row.pillarLabel}" on "${row.project}".`);
    const pillarId = pillarsBySlug.get(pillarSlug)!;

    const id = projectId(row.project);
    const endDate = parseCompletionDate(row.completionDateRaw);
    if (!endDate) withoutDate++;
    const currentStatus = toExecutionStatus(row.currentStatusRaw);

    const notes = [row.comment, row.currentStatusRaw && `Reported status: ${row.currentStatusRaw}`]
      .filter((part) => part && part.toUpperCase() !== "N/A")
      .join(" ");

    const data = {
      programmeId: programme.id,
      name: row.project,
      owner: NISO_LEAD_INSTITUTION,
      leadName: "NISO Systems Planning Directorate",
      location: "National",
      latitude: 0,
      longitude: 0,
      coverage: "National",
      pillarId,
      stateId: null,
      lifecycleStage: currentStatus === "COMPLETED" ? ("OPERATIONS" as const) : ("IMPLEMENTATION" as const),
      programType: "GOVERNMENT_FUNDED" as const,
      fundingSource: row.fundingSource || null,
      fundingStructure: row.fundingStatusRaw || "To be confirmed",
      fundingStatus: "UNFUNDED" as const,
      pipelineReadiness: null,
      projectedStatus: currentStatus,
      currentStatus,
      startDate: new Date(),
      endDate,
      evidenceUrl: uploadedFile.id,
      bottleneckCategory: null,
      comment: notes,
      suggestion: row.suggestion.toUpperCase() === "N/A" ? "" : row.suggestion,
      validationStatus: "PUBLIC_SOURCE" as const,
      description: "NISO Systems Planning Directorate register entry.",
      budgetUsd: 0,
      disbursedUsd: 0,
      contractor: null,
      contactName: "NISO Systems Planning Directorate",
      contactEmail: "unassigned@example.gov.ng",
    };

    const existing = await prisma.project.findUnique({ where: { id } });
    await prisma.project.upsert({ where: { id }, create: { id, ...data }, update: data });
    if (existing) updated++;
    else created++;
  }

  console.log(
    `Project: ${created} created, ${updated} updated, ${rows.length} total (${withoutDate} with no projected completion date, stored as null).`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
