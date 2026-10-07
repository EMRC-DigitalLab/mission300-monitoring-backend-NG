import { isStatusUnit, statusLabel, statusValueError } from "./status-values";

describe("status values", () => {
  it.each(["status", "stage", "Yes/No", "Date / status"])("treats %s as a status unit", (unit) => {
    expect(isStatusUnit(unit)).toBe(true);
  });

  it.each(["MW", "%", "Number", "USD", "connections"])("does not treat %s as a status unit", (unit) => {
    expect(isStatusUnit(unit)).toBe(false);
  });

  it("labels the three levels", () => {
    expect(statusLabel(0)).toBe("Not yet achieved");
    expect(statusLabel(1)).toBe("In progress");
    expect(statusLabel(2)).toBe("Achieved");
  });

  it("has no label for a number that is not a level, or for no value", () => {
    expect(statusLabel(3)).toBeNull();
    expect(statusLabel(1.5)).toBeNull();
    expect(statusLabel(null)).toBeNull();
  });

  it("accepts a level and rejects any other number for a status indicator", () => {
    expect(statusValueError("status", 2)).toBeNull();
    expect(statusValueError("status", 7)).toContain("0 = Not yet achieved");
  });

  it("never restricts a numeric indicator", () => {
    expect(statusValueError("MW", 4285)).toBeNull();
  });
});
