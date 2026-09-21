// Runtime counterpart of prisma/lib/disco-institutions.ts. Duplicated
// intentionally: prisma/ scripts and this src/ runtime compile separately,
// matching the existing accepted duplication between the two ingest
// scripts rather than fighting the build setup for one small static table.

// Excel short name -> canonical full institution name. PH/Port Harcourt/
// Portharcourt are 3 spellings for the same DisCo found in the raw sheets -
// a real data-quality issue in the source file, not a modelling choice.
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
  // Also accept the canonical full names themselves, case-insensitively,
  // since a filer may type the full name rather than the short form.
  "Abuja Electricity Distribution Company": "Abuja Electricity Distribution Company",
  "Benin Electricity Distribution Company": "Benin Electricity Distribution Company",
  "Eko Electricity Distribution Company": "Eko Electricity Distribution Company",
  "Enugu Electricity Distribution Company": "Enugu Electricity Distribution Company",
  "Ibadan Electricity Distribution Company": "Ibadan Electricity Distribution Company",
  "Ikeja Electric": "Ikeja Electric",
  "Jos Electricity Distribution Company": "Jos Electricity Distribution Company",
  "Kaduna Electricity Distribution Company": "Kaduna Electricity Distribution Company",
  "Kano Electricity Distribution Company": "Kano Electricity Distribution Company",
  "Port Harcourt Electricity Distribution Company": "Port Harcourt Electricity Distribution Company",
  "Yola Electricity Distribution Company": "Yola Electricity Distribution Company",
  "Aba Power Limited": "Aba Power Limited",
};

const DISCO_NAME_MAP_LOWER = new Map(
  Object.entries(DISCO_NAME_MAP).map(([raw, canonical]) => [raw.toLowerCase(), canonical]),
);

export function resolveDiscoName(raw: string): string | undefined {
  return DISCO_NAME_MAP_LOWER.get(raw.trim().toLowerCase());
}

// The canonical full names, for the template's Discos dropdown - a filer
// picks one of these rather than free-typing a short form or misspelling.
export const DISCO_CANONICAL_NAMES = [
  "Abuja Electricity Distribution Company",
  "Benin Electricity Distribution Company",
  "Eko Electricity Distribution Company",
  "Enugu Electricity Distribution Company",
  "Ibadan Electricity Distribution Company",
  "Ikeja Electric",
  "Jos Electricity Distribution Company",
  "Kaduna Electricity Distribution Company",
  "Kano Electricity Distribution Company",
  "Port Harcourt Electricity Distribution Company",
  "Yola Electricity Distribution Company",
  "Aba Power Limited",
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_TO_QUARTER: Record<string, number> = {
  January: 1,
  February: 1,
  March: 1,
  April: 2,
  May: 2,
  June: 2,
  July: 3,
  August: 3,
  September: 3,
  October: 4,
  November: 4,
  December: 4,
};
