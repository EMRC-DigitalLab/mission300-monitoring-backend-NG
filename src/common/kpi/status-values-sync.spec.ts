import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("status values copies", () => {
  it("keeps the app copy identical to the scripts copy", () => {
    const read = (path: string) => readFileSync(join(__dirname, path), "utf8").replace(/\r\n/g, "\n");
    expect(read("status-values.ts")).toBe(read("../../../prisma/lib/status-values.ts"));
  });
});
