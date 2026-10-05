import {
  CANONICAL_INSTITUTIONS,
  normalizeInstitutionToken,
  resolveInstitutionSources,
  splitInstitutionTokens,
} from "./institution-alias";

const LIVE_SOURCE_INSTITUTION_VALUES = [
  "REA",
  "NERC",
  "Federal Ministry of Power",
  "NISO / TCN",
  "Rural Electrification Agency",
  "REA DARES PMU",
  "West African Power Pool",
  "CDMU",
  "Transmission Company of Nigeria",
  "TCN",
  "REA (DARES PMU)",
  "NERC / Federal Ministry of Finance",
  "NISO / TCN / NERC; Cycle 1 2026 Compact Progress Report (CDMU)",
  "Federal Ministry of Power / NERC",
  "PMI Secretariat / NERC",
  "NISO / NERC",
  "NERC (PIP Monitoring Unit)",
  "CDMU (Cycle 1 2026 Compact Progress Report)",
  "SDG7 Tracking Report",
  "National reports",
  "FMoP / REA",
  "NNPC",
  "DisCos (11 Distribution Companies)",
  "NBS",
  "Disco",
  "Nigeria CDMU",
  "Federal Ministry of Environment",
  "CDMU (Cycle 1 2026 Compact Progress Report), population estimate as supplied",
  "Federal Ministry of Finance",
  "FMoP / REA / FMoF",
  "NISO / TCN / NERC",
];

describe("normalizeInstitutionToken", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeInstitutionToken("  Federal   Ministry of Power!  ")).toBe(
      "federal ministry of power",
    );
  });
});

describe("splitInstitutionTokens", () => {
  it("splits on slashes", () => {
    expect(splitInstitutionTokens("NISO / NERC")).toEqual(["niso", "nerc"]);
  });

  it("treats parenthetical content as its own token", () => {
    expect(splitInstitutionTokens("REA (DARES PMU)")).toEqual(["rea", "dares pmu"]);
  });

  it("splits on semicolons and commas", () => {
    expect(splitInstitutionTokens("NISO; NERC, CDMU")).toEqual(["niso", "nerc", "cdmu"]);
  });
});

describe("resolveInstitutionSources", () => {
  it("resolves a bare acronym that is not the stored institution name", () => {
    expect(resolveInstitutionSources("REA").slugs).toEqual(["rea"]);
  });

  it("resolves the full stored name to the same slug as its acronym", () => {
    expect(resolveInstitutionSources("Rural Electrification Agency (REA)").slugs).toEqual(["rea"]);
  });

  it("collapses NISO and TCN spellings onto the single merged record", () => {
    expect(resolveInstitutionSources("NISO / TCN").slugs).toEqual(["niso-tcn"]);
    expect(resolveInstitutionSources("TCN").slugs).toEqual(["niso-tcn"]);
    expect(resolveInstitutionSources("Transmission Company of Nigeria").slugs).toEqual([
      "niso-tcn",
    ]);
  });

  it("returns every institution in a compound string", () => {
    expect(resolveInstitutionSources("FMoP / REA / FMoF").slugs).toEqual(["fmop", "rea", "fmof"]);
  });

  it("separates a publication reference from the institution that supplied it", () => {
    const result = resolveInstitutionSources(
      "NISO / TCN / NERC; Cycle 1 2026 Compact Progress Report (CDMU)",
    );
    expect(result.slugs).toEqual(["niso-tcn", "nerc", "cdmu"]);
    expect(result.nonInstitution).toEqual(["cycle 1 2026 compact progress report"]);
    expect(result.unresolved).toEqual([]);
  });

  it("flags a collective DisCo reference instead of guessing one DisCo", () => {
    const result = resolveInstitutionSources("DisCos (11 Distribution Companies)");
    expect(result.allDiscos).toBe(true);
    expect(result.slugs).toEqual([]);
  });

  it("classifies a publication as non-institution rather than unresolved", () => {
    const result = resolveInstitutionSources("SDG7 Tracking Report");
    expect(result.nonInstitution).toEqual(["sdg7 tracking report"]);
    expect(result.slugs).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it("reports genuinely unknown text as unresolved", () => {
    expect(resolveInstitutionSources("Some Agency Nobody Registered").unresolved).toEqual([
      "some agency nobody registered",
    ]);
  });

  it("leaves nothing unresolved across every value in live staging", () => {
    const stillUnresolved = LIVE_SOURCE_INSTITUTION_VALUES.filter((value) => {
      const result = resolveInstitutionSources(value);
      return result.unresolved.length > 0;
    });
    expect(stillUnresolved).toEqual([]);
  });

  it("maps every live value to at least one institution, a DisCo collective, or a publication", () => {
    for (const value of LIVE_SOURCE_INSTITUTION_VALUES) {
      const result = resolveInstitutionSources(value);
      const accounted =
        result.slugs.length > 0 || result.allDiscos || result.nonInstitution.length > 0;
      expect({ value, accounted }).toEqual({ value, accounted: true });
    }
  });

  it("only emits slugs that have a canonical institution record defined", () => {
    for (const value of LIVE_SOURCE_INSTITUTION_VALUES) {
      for (const slug of resolveInstitutionSources(value).slugs) {
        expect(CANONICAL_INSTITUTIONS[slug]).toBeDefined();
      }
    }
  });
});
