// The scripts build (prisma/tsconfig.scripts.json) cannot import from src/ and the app build cannot import from prisma/, so this file exists in both places. status-values-sync.spec.ts fails if they differ.
export const STATUS_UNITS: ReadonlySet<string> = new Set(["status", "stage", "Yes/No", "Date / status"]);

export const STATUS_LEVELS = [
  { value: 0, label: "Not yet achieved" },
  { value: 1, label: "In progress" },
  { value: 2, label: "Achieved" },
] as const;

export function isStatusUnit(unit: string): boolean {
  return STATUS_UNITS.has(unit);
}

export function statusLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return STATUS_LEVELS.find((level) => level.value === Number(value))?.label ?? null;
}

export function statusValueError(unit: string, value: number): string | null {
  if (!isStatusUnit(unit)) return null;
  if (STATUS_LEVELS.some((level) => level.value === value)) return null;
  const choices = STATUS_LEVELS.map((level) => `${level.value} = ${level.label}`).join(", ");
  return `This indicator records a status, so the value must be one of: ${choices}.`;
}
