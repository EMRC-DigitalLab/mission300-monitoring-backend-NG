import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { DatasetField } from "@prisma/client";

const SHEET_NAME = "Submission";
const PERIOD_COLUMN_KEY = "period";

function periodColumnHeader(frequency: string): string {
  if (frequency === "Monthly") return "Period (e.g. January 2026)";
  if (frequency === "Annual") return "Period (e.g. 2026)";
  return "Period (e.g. Q3 2026)";
}

export async function generateTemplateBuffer(fields: DatasetField[], frequency: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: periodColumnHeader(frequency), key: PERIOD_COLUMN_KEY, width: 24 },
    ...[...fields]
      .sort((a, b) => a.order - b.order)
      .map((field) => ({ header: field.label, key: field.id, width: 28 })),
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface ParsedSubmissionRow {
  period: string;
  values: Record<string, string>;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function isPeriodHeader(headerText: string): boolean {
  return normalizeLabel(headerText).startsWith("period");
}

function isRowBlank(row: ExcelJS.Row): boolean {
  let hasValue = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== "") hasValue = true;
  });
  return !hasValue;
}

export async function parseSubmissionFile(
  buffer: Buffer,
  fileName: string,
  fields: DatasetField[],
): Promise<ParsedSubmissionRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (fileName.toLowerCase().endsWith(".csv")) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }

  const sheet = workbook.worksheets[0];
  const headerRow = sheet?.getRow(1);
  if (!sheet || !headerRow) {
    throw new Error("The uploaded file has no header row to read.");
  }

  const fieldByLabel = new Map(fields.map((field) => [normalizeLabel(field.label), field]));
  const columnRoles = new Map<number, { kind: "period" } | { kind: "field"; fieldId: string }>();
  headerRow.eachCell((cell, columnNumber) => {
    const headerText = String(cell.value ?? "");
    if (isPeriodHeader(headerText)) {
      columnRoles.set(columnNumber, { kind: "period" });
      return;
    }
    const field = fieldByLabel.get(normalizeLabel(headerText));
    if (field) columnRoles.set(columnNumber, { kind: "field", fieldId: field.id });
  });

  const rows: ParsedSubmissionRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const dataRow = sheet.getRow(rowNumber);
    if (isRowBlank(dataRow)) continue;

    let period = "";
    const values: Record<string, string> = {};
    for (const [columnNumber, role] of columnRoles) {
      const raw = dataRow.getCell(columnNumber).value;
      const text = raw === null || raw === undefined ? "" : String(raw).trim();
      if (role.kind === "period") period = text;
      else values[role.fieldId] = text;
    }
    rows.push({ period, values });
  }

  return rows;
}

export interface FieldValidationIssue {
  fieldId: string;
  label: string;
  message: string;
}

export function validateFieldValues(
  fields: DatasetField[],
  values: Record<string, string>,
): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];
  for (const field of fields) {
    const trimmed = values[field.id]?.trim() ?? "";
    if (field.required && !trimmed) {
      issues.push({ fieldId: field.id, label: field.label, message: `${field.label} is required.` });
      continue;
    }
    if (trimmed && field.type === "NUMBER" && Number.isNaN(Number(trimmed))) {
      issues.push({ fieldId: field.id, label: field.label, message: `${field.label} must be a number.` });
    }
  }
  return issues;
}

export function buildSubmissionItems(
  fields: DatasetField[],
  values: Record<string, string>,
  period: string,
): { kpiDefinitionId: string; period: string; value: number }[] {
  const items: { kpiDefinitionId: string; period: string; value: number }[] = [];
  for (const field of fields) {
    if (!field.kpiDefinitionId) continue;
    const trimmed = values[field.id]?.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (Number.isNaN(value)) continue;
    items.push({ kpiDefinitionId: field.kpiDefinitionId, period, value });
  }
  return items;
}
