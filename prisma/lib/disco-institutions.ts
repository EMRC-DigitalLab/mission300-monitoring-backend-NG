// Matches seed.ts's DISCOS id scheme exactly (`seed-disco-${slug}`) so every
// script that touches DisCo institutions converges on the same rows
// regardless of which runs first or whether both run against the same
// database.
export const DISCO_NAMES = [
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
  // Not one of the 11 standard privatization-era DisCos - a separate, newer
  // independent distribution franchise for Aba and its metro area (Abia
  // State), confirmed with the user before adding.
  "Aba Power Limited",
];

export function discoInstitutionId(fullName: string): string {
  return `seed-disco-${fullName.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

// Excel short name -> canonical full institution name. PH/Port Harcourt/
// Portharcourt are 3 spellings for the same DisCo found in the raw sheets -
// a real data-quality issue in the source file, not a modelling choice.
export const DISCO_NAME_MAP: Record<string, string> = {
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
};

// Case-insensitive lookup - the workbook has inconsistent casing for the
// same DisCo across sheets (e.g. "Portharcourt" in some, "portharcourt" in
// others), on top of the outright different spellings DISCO_NAME_MAP above
// already normalizes.
const DISCO_NAME_MAP_LOWER = new Map(
  Object.entries(DISCO_NAME_MAP).map(([raw, canonical]) => [raw.toLowerCase(), canonical]),
);

export function resolveDiscoName(raw: string): string | undefined {
  return DISCO_NAME_MAP_LOWER.get(raw.trim().toLowerCase());
}

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
