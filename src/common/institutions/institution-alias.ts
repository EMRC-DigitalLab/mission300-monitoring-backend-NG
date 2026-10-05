export type CanonicalInstitutionSlug =
  | "rea"
  | "nerc"
  | "niso-tcn"
  | "cdmu"
  | "fmop"
  | "fmof"
  | "fmenv"
  | "nnpc"
  | "nbs"
  | "wapp"
  | "fgn-powerco"
  | "pmi-secretariat";

export const ALL_DISCOS = "all-discos" as const;

export type InstitutionResolution = {
  slugs: CanonicalInstitutionSlug[];
  allDiscos: boolean;
  unresolved: string[];
  nonInstitution: string[];
};

export const CANONICAL_INSTITUTIONS: Record<
  CanonicalInstitutionSlug,
  { id: string; name: string; type: string }
> = {
  rea: { id: "seed-institution-rea", name: "Rural Electrification Agency (REA)", type: "Federal Agency" },
  nerc: {
    id: "seed-institution-nerc",
    name: "Nigerian Electricity Regulatory Commission (NERC)",
    type: "Regulator",
  },
  "niso-tcn": { id: "seed-institution-niso-tcn", name: "NISO / TCN", type: "Federal Agency" },
  cdmu: {
    id: "seed-institution-cdmu",
    name: "Compact Delivery and Monitoring Unit (CDMU)",
    type: "Federal Coordinating Unit",
  },
  fmop: { id: "seed-institution-fmop", name: "Federal Ministry of Power", type: "Federal Ministry" },
  fmof: { id: "seed-institution-fmof", name: "Federal Ministry of Finance", type: "Federal Ministry" },
  fmenv: {
    id: "seed-institution-fmenv",
    name: "Federal Ministry of Environment",
    type: "Federal Ministry",
  },
  nnpc: {
    id: "seed-institution-nnpc",
    name: "Nigerian National Petroleum Company (NNPC)",
    type: "State-Owned Enterprise",
  },
  nbs: {
    id: "seed-institution-nbs",
    name: "National Bureau of Statistics (NBS)",
    type: "Federal Agency",
  },
  wapp: {
    id: "seed-institution-wapp",
    name: "West African Power Pool (WAPP)",
    type: "Regional Body",
  },
  "fgn-powerco": {
    id: "seed-institution-fgn-powerco",
    name: "FGN Power Company (FGN PowerCO)",
    type: "State-Owned Enterprise",
  },
  "pmi-secretariat": {
    id: "seed-institution-pmi-secretariat",
    name: "Presidential Metering Initiative Secretariat",
    type: "Federal Programme Unit",
  },
};

const ALIASES: Record<string, CanonicalInstitutionSlug> = {
  rea: "rea",
  "rural electrification agency": "rea",
  "rural electrification agency rea": "rea",
  "rea dares pmu": "rea",
  "dares pmu": "rea",

  nerc: "nerc",
  "nigerian electricity regulatory commission": "nerc",
  "nigerian electricity regulatory commission nerc": "nerc",
  "pip monitoring unit": "nerc",

  niso: "niso-tcn",
  tcn: "niso-tcn",
  "niso tcn": "niso-tcn",
  "transmission company of nigeria": "niso-tcn",
  "nigerian independent system operator": "niso-tcn",
  "nigerian independent system operator niso": "niso-tcn",

  cdmu: "cdmu",
  "nigeria cdmu": "cdmu",
  "compact delivery and monitoring unit": "cdmu",
  "compact delivery and monitoring unit cdmu": "cdmu",

  fmop: "fmop",
  "federal ministry of power": "fmop",
  fmof: "fmof",
  "federal ministry of finance": "fmof",
  fmenv: "fmenv",
  "federal ministry of environment": "fmenv",

  nnpc: "nnpc",
  "nigerian national petroleum company": "nnpc",
  nbs: "nbs",
  "national bureau of statistics": "nbs",
  wapp: "wapp",
  "west african power pool": "wapp",

  "fgn powerco": "fgn-powerco",
  "fgn power company": "fgn-powerco",
  "fgn power company fgn powerco": "fgn-powerco",

  "pmi secretariat": "pmi-secretariat",
  "presidential metering initiative secretariat": "pmi-secretariat",
};

const DISCO_COLLECTIVES = new Set([
  "disco",
  "discos",
  "distribution companies",
  "discos 11 distribution companies",
  "11 distribution companies",
]);

const NON_INSTITUTIONS = new Set([
  "sdg7 tracking report",
  "national reports",
  "cycle 1 2026 compact progress report",
  "population estimate as supplied",
  "not supplied",
]);

export function normalizeInstitutionToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitInstitutionTokens(raw: string): string[] {
  return raw
    .split(/[/;,()+&]|\sand\s/gi)
    .map((part) => normalizeInstitutionToken(part))
    .filter((part) => part.length > 0);
}

export function resolveInstitutionSources(raw: string): InstitutionResolution {
  const slugs: CanonicalInstitutionSlug[] = [];
  const unresolved: string[] = [];
  const nonInstitution: string[] = [];
  let allDiscos = false;

  for (const token of splitInstitutionTokens(raw)) {
    const slug = ALIASES[token];
    if (slug) {
      if (!slugs.includes(slug)) slugs.push(slug);
      continue;
    }
    if (DISCO_COLLECTIVES.has(token)) {
      allDiscos = true;
      continue;
    }
    if (NON_INSTITUTIONS.has(token)) {
      if (!nonInstitution.includes(token)) nonInstitution.push(token);
      continue;
    }
    if (!unresolved.includes(token)) unresolved.push(token);
  }

  return { slugs, allDiscos, unresolved, nonInstitution };
}
