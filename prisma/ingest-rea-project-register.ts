import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * One-off backfill of REA's "Energizing Education Programme (EEP) Phase
 * III" - one Programme + 8 Projects - from the "Project Register" sheet of
 * "EMRC - M300 REA KPI Requirements and Project Register v1-1
 * 2026-09-09.xlsx" (m300-frontend/docs/). Distinct source workbook from the
 * NERC one the other ingest-* scripts read - this one has no per-project
 * budget/coordinates/start-date/named-lead columns, only what's listed
 * below as read directly from the sheet.
 *
 * A few required fields have no column in this sheet at all. Rather than
 * invent a figure, each is set to the same default the real quick-add form
 * already uses for exactly this situation (ProgramsService.createProgramme/
 * createProject) - so a reader who knows that form's own defaults sees
 * nothing surprising here:
 * - startDate (Programme and Project): today (the date this script runs),
 *   same as the quick-add form's own default for an unstated start date.
 * - latitude/longitude: 0,0, same as the quick-add form - "until a
 *   geocoding step exists" (see Project.latitude's own schema comment).
 * - leadName/contactName: "REA Project Management Unit" - a role, not an
 *   invented person's name, since no named individual is given.
 * - contactEmail: "unassigned@example.gov.ng", the same placeholder the
 *   quick-add form uses.
 * - coverage, budgetUsd, disbursedUsd, contractor: the quick-add form's own
 *   defaults ("To be confirmed", 0, 0, null) - no per-project figure exists
 *   in this source for any of them.
 * - stateId: left null - the schema's own comment on Project.stateId is
 *   explicit that "not yet tagged" beats guessing a state from a free-text
 *   location, which is exactly the situation here.
 *
 * Read directly from the sheet: Program name, Project name, M300 Pillar
 * Alignment, Projected Completion Date (parsed to a quarter-end date -
 * "August/September 2025" -> 2025-09-30), Projected/Current Status,
 * Comment, Suggestion, and the combined funding column (split below into
 * fundingSource from "Funding Sources/Funding Size/Funding Structure" and
 * fundingStructure/fundingStatus from "Funding Status").
 *
 * validationStatus is PUBLIC_SOURCE (not CONFIRMED) on every row here -
 * this is a real REA institutional register, but has not been formally
 * confirmed through this platform's own workflow.
 *
 * Idempotent: every row uses a deterministic id derived from the project
 * name, safe to re-run.
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-rea-project-register.js
 */

const WORKBOOK_PATH = join(process.cwd(), "prisma", "data", "rea-kpi-requirements-and-project-register.xlsx");
const EVIDENCE_ORIGINAL_NAME = "EMRC - M300 REA KPI Requirements and Project Register v1-1 2026-09-09.xlsx";

const PROGRAMME_ID = "rea-eep3-programme";
const PROGRAMME_NAME = "Energizing Education Programme (EEP) Phase III";
const REA_LEAD_INSTITUTION = "Rural Electrification Agency (REA)";
const PILLAR_SLUG = "last-mile-access";
const AFDB_FUNDING =
  "African Development Bank (AfDB) financing under the Nigeria Electrification Project (NEP)";

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as { text?: string })) {
    return String((value as { text?: string }).text ?? "");
  }
  return String(value).trim();
}

function projectId(name: string): string {
  return `rea-eep3-project-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

/** The sheet's "Projected Completion Date" is a free-text month range
 * ("August/September 2025"), not a real date column - this reads the last
 * named month and takes its quarter end, honestly reflecting that it's a
 * range, not a single day. */
function parseCompletionDate(raw: string): Date {
  const match = /([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!match) throw new Error(`Cannot parse a completion date from "${raw}".`);
  const [, monthName, yearStr] = match;
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) throw new Error(`Unrecognized month name in "${raw}".`);
  const quarter = Math.floor(monthIndex / 3) + 1;
  const quarterEndMonth = quarter * 3 - 1; // 0-indexed
  const lastDay = new Date(Date.UTC(Number(yearStr), quarterEndMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(Number(yearStr), quarterEndMonth, lastDay));
}

interface ProjectRow {
  project: string;
  completionDateRaw: string;
  currentStatus: string;
  comment: string;
  suggestion: string;
  fundingSource: string;
  fundingStatusRaw: string;
}

function readProjectRegister(workbook: ExcelJS.Workbook): ProjectRow[] {
  const sheet = workbook.getWorksheet("Project Register");
  if (!sheet) throw new Error('Sheet "Project Register" not found.');

  const rows: ProjectRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return; // title row, blank row, header row
    const project = cellString(row.getCell(2).value);
    if (!project) return;
    rows.push({
      project,
      completionDateRaw: cellString(row.getCell(4).value),
      currentStatus: cellString(row.getCell(6).value),
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
  const rows = readProjectRegister(workbook);
  console.log(`Project rows read: ${rows.length}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const pillar = await prisma.pillar.findUnique({ where: { slug: PILLAR_SLUG } });
  if (!pillar) throw new Error(`Pillar "${PILLAR_SLUG}" not found - run ingest-kpi-directory.js first.`);

  const admin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMINISTRATOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No SYSTEM_ADMINISTRATOR user found to attribute the evidence file upload to.");

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
    console.log(`Evidence file stored: uploadedFile.id=${uploadedFile.id}`);
  } else {
    console.log(`Evidence file already stored, reusing: uploadedFile.id=${uploadedFile.id}`);
  }

  const latestCompletionDate = rows
    .map((r) => parseCompletionDate(r.completionDateRaw))
    .reduce((latest, d) => (d > latest ? d : latest));

  const programme = await prisma.programme.upsert({
    where: { id: PROGRAMME_ID },
    create: {
      id: PROGRAMME_ID,
      name: PROGRAMME_NAME,
      leadInstitution: REA_LEAD_INSTITUTION,
      supportingInstitutions: [],
      pillarId: pillar.id,
      objectives:
        "Deploys solar hybrid mini-grid power to Nigerian tertiary institutions and teaching hospitals, funded under the Nigeria Electrification Project (NEP).",
      financing: AFDB_FUNDING,
      status: "COMPLETED",
      priority: "STANDARD",
      startDate: new Date(),
      endDate: latestCompletionDate,
      bottleneckCategory: null,
      validationStatus: "PUBLIC_SOURCE",
    },
    update: {},
  });
  console.log(`Programme upserted: ${programme.id}`);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const id = projectId(row.project);
    const endDate = parseCompletionDate(row.completionDateRaw);
    const currentStatus = row.currentStatus.toUpperCase() === "COMPLETED" ? "COMPLETED" : "ON_TRACK";
    const fundingStatus = row.fundingStatusRaw.toLowerCase().includes("tranche") ? "DISBURSING" : "COMMITTED";

    const data = {
      programmeId: programme.id,
      name: row.project,
      owner: REA_LEAD_INSTITUTION,
      leadName: "REA Project Management Unit",
      location: row.project,
      latitude: 0,
      longitude: 0,
      coverage: "To be confirmed",
      pillarId: pillar.id,
      stateId: null,
      lifecycleStage: currentStatus === "COMPLETED" ? "OPERATIONS" : "IMPLEMENTATION",
      programType: "CONCESSIONAL_LOAN",
      fundingSource: row.fundingSource || AFDB_FUNDING,
      fundingStructure: row.fundingStatusRaw || "To be confirmed",
      fundingStatus,
      pipelineReadiness: null,
      projectedStatus: currentStatus,
      currentStatus,
      startDate: new Date(),
      endDate,
      evidenceUrl: uploadedFile.id,
      bottleneckCategory: null,
      comment: row.comment.toUpperCase() === "N/A" ? "" : row.comment,
      suggestion: row.suggestion.toUpperCase() === "N/A" ? "" : row.suggestion,
      validationStatus: "PUBLIC_SOURCE",
      description: `One of ${PROGRAMME_NAME}'s solar hybrid power installations.`,
      budgetUsd: 0,
      disbursedUsd: 0,
      contractor: null,
      contactName: "REA Project Management Unit",
      contactEmail: "unassigned@example.gov.ng",
    } as const;

    const existing = await prisma.project.findUnique({ where: { id } });

    await prisma.project.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });

    if (!existing) {
      await prisma.projectStatusHistoryEntry.create({
        data: { projectId: id, period: "q3-2025", status: currentStatus },
      });
    }

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
