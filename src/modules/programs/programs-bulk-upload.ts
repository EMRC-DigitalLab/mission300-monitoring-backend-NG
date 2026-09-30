import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Pillar } from "@prisma/client";
import { ExecutionStatus, PipelineReadiness } from "@prisma/client";
import { toKebabCase } from "@/common/utils/enum-casing";

// One flat sheet: one row = one project, with the parent programme's own
// fields repeated on every row that belongs to it. Chosen over a two-sheet
// workbook so a person filling this in never has to cross-reference a
// separate tab to know which programme a project row belongs to - the
// trade-off (the same programme's fields can disagree across its rows) is
// handled at parse time by upserting the programme from the FIRST row that
// names it, so later rows for that programme only need the name to match.
const SHEET_NAME = "Programs & Projects";
const LOOKUP_SHEET_NAME = "Lookup";
const DROPDOWN_ROW_COUNT = 500;

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  DELAYED: "Delayed",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

const READINESS_LABELS: Record<PipelineReadiness, string> = {
  PIPELINE: "Pipeline",
  FEASIBILITY_STUDY: "Feasibility study",
  INVESTMENT_READY: "Investment ready",
};

const COLUMNS = [
  { header: "Programme name", key: "programmeName", width: 32 },
  { header: "Programme lead institution", key: "programmeLeadInstitution", width: 28 },
  { header: "Programme pillar", key: "programmePillar", width: 26 },
  { header: "Programme objectives", key: "programmeObjectives", width: 40 },
  { header: "Programme financing (optional)", key: "programmeFinancing", width: 24 },
  { header: "Programme status", key: "programmeStatus", width: 16 },
  { header: "Programme end date (YYYY-MM-DD)", key: "programmeEndDate", width: 20 },
  { header: "Project name", key: "projectName", width: 32 },
  { header: "Project owner institution", key: "projectOwner", width: 28 },
  { header: "Project lead name", key: "projectLeadName", width: 22 },
  { header: "Project location", key: "projectLocation", width: 22 },
  { header: "Project pillar", key: "projectPillar", width: 26 },
  { header: "Project status", key: "projectStatus", width: 16 },
  { header: "Project end date (YYYY-MM-DD, optional)", key: "projectEndDate", width: 20 },
  { header: "Pipeline readiness (optional)", key: "pipelineReadiness", width: 20 },
  { header: "Comment (optional)", key: "comment", width: 32 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const PILLAR_COLUMN_KEYS: ColumnKey[] = ["programmePillar", "projectPillar"];
const STATUS_COLUMN_KEYS: ColumnKey[] = ["programmeStatus", "projectStatus"];

export async function generateProjectsBulkTemplateBuffer(pillars: Pillar[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  sheet.getRow(1).font = { bold: true };

  const pillarNames = pillars.map((pillar) => pillar.name);
  const statusLabels = Object.values(STATUS_LABELS);
  const readinessLabels = Object.values(READINESS_LABELS);

  // Long option lists don't fit Excel's ~255-char inline list formula, so
  // they live on a hidden lookup sheet the dropdowns reference - same
  // pattern as the Data Submissions template (dataset-template.ts).
  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME, { state: "veryHidden" });
  pillarNames.forEach((name, index) => (lookupSheet.getCell(index + 1, 1).value = name));
  statusLabels.forEach((label, index) => (lookupSheet.getCell(index + 1, 2).value = label));
  readinessLabels.forEach((label, index) => (lookupSheet.getCell(index + 1, 3).value = label));

  const columnNumberFor = (key: ColumnKey) => COLUMNS.findIndex((c) => c.key === key) + 1;

  for (let row = 2; row <= DROPDOWN_ROW_COUNT + 1; row++) {
    for (const key of PILLAR_COLUMN_KEYS) {
      sheet.getCell(row, columnNumberFor(key)).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`${LOOKUP_SHEET_NAME}!$A$1:$A$${pillarNames.length}`],
        showErrorMessage: true,
        errorStyle: "error",
        error: "Pick a pillar from the dropdown list.",
      };
    }
    for (const key of STATUS_COLUMN_KEYS) {
      sheet.getCell(row, columnNumberFor(key)).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`${LOOKUP_SHEET_NAME}!$B$1:$B$${statusLabels.length}`],
        showErrorMessage: true,
        errorStyle: "error",
        error: "Pick a status from the dropdown list.",
      };
    }
    sheet.getCell(row, columnNumberFor("pipelineReadiness")).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`${LOOKUP_SHEET_NAME}!$C$1:$C$${readinessLabels.length}`],
      showErrorMessage: true,
      errorStyle: "error",
      error: "Pick a readiness stage from the dropdown list, or leave blank.",
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface BulkUploadRow {
  rowNumber: number;
  values: Partial<Record<ColumnKey, string>>;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();
}

const HEADER_TO_KEY = new Map<string, ColumnKey>(
  COLUMNS.map((column) => [normalizeHeader(column.header), column.key]),
);

function isRowBlank(row: ExcelJS.Row): boolean {
  let hasValue = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== "") hasValue = true;
  });
  return !hasValue;
}

function cellText(row: ExcelJS.Row, columnNumber: number): string {
  const raw = row.getCell(columnNumber).value;
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "object" && "text" in (raw as unknown as { text?: unknown })) {
    return String((raw as unknown as { text: unknown }).text ?? "").trim();
  }
  return String(raw).trim();
}

export async function parseProjectsBulkFile(buffer: Buffer, fileName: string): Promise<BulkUploadRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (fileName.toLowerCase().endsWith(".csv")) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }

  const sheet = workbook.worksheets[0];
  const headerRow = sheet?.getRow(1);
  if (!sheet || !headerRow) throw new Error("The uploaded file has no header row to read.");

  const columnKeyByNumber = new Map<number, ColumnKey>();
  headerRow.eachCell((cell, columnNumber) => {
    const key = HEADER_TO_KEY.get(normalizeHeader(String(cell.value ?? "")));
    if (key) columnKeyByNumber.set(columnNumber, key);
  });

  const rows: BulkUploadRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const dataRow = sheet.getRow(rowNumber);
    if (isRowBlank(dataRow)) continue;

    const values: Partial<Record<ColumnKey, string>> = {};
    for (const [columnNumber, key] of columnKeyByNumber) {
      values[key] = cellText(dataRow, columnNumber);
    }
    rows.push({ rowNumber, values });
  }

  return rows;
}

/** Matches a dropdown label (or a Prisma enum value typed in directly) back
 * to its enum member - tolerant of the exact template label, kebab-case, or
 * the raw SCREAMING_SNAKE_CASE value, since a person may hand-type a cell
 * instead of using the dropdown. */
function matchLabel<T extends string>(input: string, labels: Record<T, string>): T | null {
  const normalized = toKebabCase(input.trim());
  for (const [value, label] of Object.entries(labels) as [T, string][]) {
    if (toKebabCase(label) === normalized || toKebabCase(value) === normalized) return value;
  }
  return null;
}

export function matchExecutionStatus(input: string): ExecutionStatus | null {
  return matchLabel(input, STATUS_LABELS);
}

export function matchPipelineReadiness(input: string): PipelineReadiness | null {
  if (!input.trim()) return null;
  return matchLabel(input, READINESS_LABELS);
}

export function matchPillar(input: string, pillars: Pillar[]): Pillar | null {
  const normalized = toKebabCase(input.trim());
  return (
    pillars.find((pillar) => toKebabCase(pillar.name) === normalized || pillar.slug === normalized) ?? null
  );
}
