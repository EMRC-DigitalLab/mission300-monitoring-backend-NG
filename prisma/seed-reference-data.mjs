import { spawnSync } from "node:child_process";
import prismaPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Loads the Mission 300 reference data (KPI directory, historical NERC/NISO/REA
// values, datasets and obligations, project registers) by running the compiled
// ingest scripts in dependency order. Every script is idempotent (upserts), so
// this is safe to run on every deploy. Deliberately does NOT run prisma/seed.ts:
// that creates demo accounts with a known password and demo programmes.
//
// Run inside the api container (same DB, same storage volume for evidence
// files): node prisma/seed-reference-data.mjs
//
// LOAD-ONCE: the scripts upsert from the source files, which would put back
// the file's values over anything edited in the app since (KPI definitions and
// targets, programme/project records, DisCo performance rows). So by default
// this only runs while the database has no KPI values yet -
// and is a no-op on every later deploy. Pass --force to reload deliberately.

const ORDER = [
  "ingest-kpi-directory",
  "ingest-rea-kpi-baseline",
  "ingest-nerc-disco-data",
  "ingest-nerc-genco-kpis",
  "ingest-nerc-tariff-kpi",
  "ingest-national-rollup-kpis",
  "ingest-access-delivery-kpis",
  "ingest-derived-utility-kpis",
  "ingest-niso-generation-kpis",
  "ingest-niso-bilateral-kpi",
  "ingest-niso-remaining-sheets",
  "ingest-nerc-datasets-obligations",
  "ingest-rea-niso-datasets-obligations",
  "ingest-rea-project-register",
  "ingest-niso-project-register",
];

const force = process.argv.includes("--force");
if (!force) {
  const prisma = new prismaPkg.PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
  const kpiValues = await prisma.kpiValue.count();
  await prisma.$disconnect();
  if (kpiValues > 0) {
    console.log(`Reference data already loaded (${kpiValues} KPI values) - skipping. Use --force to reload.`);
    process.exit(0);
  }
}

for (const [index, name] of ORDER.entries()) {
  console.log(`\n[${index + 1}/${ORDER.length}] ${name}`);
  const result = spawnSync(process.execPath, [`dist/prisma/${name}.js`], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nReference data load failed at ${name} (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nReference data loaded (${ORDER.length} scripts).`);
