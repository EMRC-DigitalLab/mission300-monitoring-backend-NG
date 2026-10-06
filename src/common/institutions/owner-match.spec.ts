import { ownerMatchesInstitution } from "./owner-match";

const NISO = { id: "seed-institution-niso-tcn", name: "NISO / TCN" };
const REA = { id: "seed-institution-rea", name: "Rural Electrification Agency (REA)" };

describe("ownerMatchesInstitution", () => {
  it("matches the registered name exactly, ignoring case and punctuation", () => {
    expect(ownerMatchesInstitution("rural electrification agency (rea)", REA)).toBe(true);
  });

  it("matches another spelling of the same institution", () => {
    expect(ownerMatchesInstitution("Nigerian Independent System Operator (NISO)", NISO)).toBe(true);
    expect(ownerMatchesInstitution("TCN", NISO)).toBe(true);
    expect(ownerMatchesInstitution("REA", REA)).toBe(true);
  });

  it("does not match a different institution", () => {
    expect(ownerMatchesInstitution("Rural Electrification Agency (REA)", NISO)).toBe(false);
    expect(ownerMatchesInstitution("NERC", REA)).toBe(false);
  });

  it("does not let a joint owner count as sole ownership", () => {
    expect(ownerMatchesInstitution("NISO / NERC", NISO)).toBe(false);
    expect(ownerMatchesInstitution("FMoP / REA", REA)).toBe(false);
  });

  it("does not match unknown text or a partial name", () => {
    expect(ownerMatchesInstitution("Some Unknown Body", REA)).toBe(false);
    expect(ownerMatchesInstitution("Rural", REA)).toBe(false);
    expect(ownerMatchesInstitution("", REA)).toBe(false);
  });
});
