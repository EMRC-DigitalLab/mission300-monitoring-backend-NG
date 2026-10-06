import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("institution alias table copies", () => {
  it("keeps the app copy identical to the scripts copy", () => {
    const normalise = (path: string) => readFileSync(join(__dirname, path), "utf8").replace(/\r\n/g, "\n");
    expect(normalise("institution-alias.ts")).toBe(normalise("../../../prisma/lib/institution-alias.ts"));
  });
});
