import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { DatasetField } from "@prisma/client";

const SHEET_NAME = "Submission";

/**
 * Real contract requirement (docs/API.md): the template is generated fresh
 * per request from the dataset's LIVE field configuration, not a stored
 * file. Header row uses each field's label - parseSubmissionFile() below
 * matches an uploaded file's columns back to fields the same way, by
 * label, so generation and parsing stay in sync automatically.
 */
export async function generateTemplateBuffer(fields: DatasetField[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [...fields]
    .sort((a, b) => a.order - b.order)
    .map((field) => ({ header: field.label, key: field.id, width: 28 }));
  sheet.addRow({}); // one blank row for the submitter to fill in
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Reads the one data row (a single obligation covers one institution x
 * dataset x reporting period, so one row is all a template ever needs) and
 * maps each column back to a DatasetField by matching its header label
 * (case/whitespace-insensitive) - returns { fieldId: rawStringValue }, the
 * same shape manualEntryRequestSchema.values uses, so both creation paths
 * feed the same validation/extraction logic downstream.
 */
export async function parseSubmissionFile(
  buffer: Buffer,
  fileName: string,
  fields: DatasetField[],
): Promise<Record<string, string>> {
  const workbook = new ExcelJS.Workbook();
  if (fileName.toLowerCase().endsWith(".csv")) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }

  const sheet = workbook.worksheets[0];
  const headerRow = sheet?.getRow(1);
  const dataRow = sheet?.getRow(2);
  if (!sheet || !headerRow || !dataRow) {
    throw new Error("The uploaded file has no data row to read.");
  }

  const fieldByLabel = new Map(fields.map((field) => [normalizeLabel(field.label), field]));
  const values: Record<string, string> = {};
  headerRow.eachCell((cell, columnNumber) => {
    const field = fieldByLabel.get(normalizeLabel(String(cell.value ?? "")));
    if (!field) return;
    const raw = dataRow.getCell(columnNumber).value;
    values[field.id] = raw === null || raw === undefined ? "" : String(raw);
  });
  return values;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export interface FieldValidationIssue {
  fieldId: string;
  label: string;
  message: string;
}

/** Required-field and basic type checks against a dataset's own field definitions. */
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

/**
 * Every field with a kpiDefinitionId feeds a KpiValue once this submission
 * is approved (see the existing recordDecision() upsert pattern in
 * submissions.service.ts, reused unchanged by Phase 3's decision
 * endpoint) - this is where extractedValues actually comes from, computed
 * once at creation time rather than re-derived later.
 */
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
    if (Number.isNaN(value)) continue; // already surfaced by validateFieldValues() when required
    items.push({ kpiDefinitionId: field.kpiDefinitionId, period, value });
  }
  return items;
}
