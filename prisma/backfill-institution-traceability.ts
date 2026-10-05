import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  CANONICAL_INSTITUTIONS,
  resolveInstitutionSources,
} from "../src/common/institutions/institution-alias";

const DATASET_OWNER_CORRECTIONS: { datasetId: string; ownerSlug: "niso-tcn" }[] = [
  { datasetId: "nerc-genco-installed-capacity", ownerSlug: "niso-tcn" },
  { datasetId: "nerc-genco-available-capacity", ownerSlug: "niso-tcn" },
];

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });
  const dryRun = process.argv.includes("--dry-run");

  for (const entry of Object.values(CANONICAL_INSTITUTIONS)) {
    if (dryRun) continue;
    await prisma.institution.upsert({
      where: { id: entry.id },
      update: { name: entry.name, type: entry.type },
      create: { id: entry.id, name: entry.name, type: entry.type },
    });
  }

  const discos = await prisma.institution.findMany({ where: { type: "Disco" }, select: { id: true } });
  const discoIds = discos.map((d) => d.id);

  const kpis = await prisma.kpiDefinition.findMany({
    where: { isActive: true },
    select: { id: true, code: true, sourceInstitution: true },
    orderBy: { code: "asc" },
  });

  let linked = 0;
  let kpisWithNoLink = 0;
  const unresolvedReport: { code: string; raw: string; unresolved: string[] }[] = [];
  const nonInstitutionReport: { code: string; raw: string; nonInstitution: string[] }[] = [];
  const discoCollectiveReport: string[] = [];

  for (const kpi of kpis) {
    const resolution = resolveInstitutionSources(kpi.sourceInstitution);
    const institutionIds = resolution.slugs.map((slug) => CANONICAL_INSTITUTIONS[slug].id);
    if (resolution.allDiscos) {
      institutionIds.push(...discoIds);
      discoCollectiveReport.push(kpi.code);
    }

    if (resolution.unresolved.length > 0) {
      unresolvedReport.push({ code: kpi.code, raw: kpi.sourceInstitution, unresolved: resolution.unresolved });
    }
    if (resolution.nonInstitution.length > 0) {
      nonInstitutionReport.push({
        code: kpi.code,
        raw: kpi.sourceInstitution,
        nonInstitution: resolution.nonInstitution,
      });
    }
    if (institutionIds.length === 0) {
      kpisWithNoLink += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.kpiSourceInstitution.deleteMany({ where: { kpiDefinitionId: kpi.id } });
      await prisma.kpiSourceInstitution.createMany({
        data: institutionIds.map((institutionId) => ({ kpiDefinitionId: kpi.id, institutionId })),
        skipDuplicates: true,
      });
    }
    linked += institutionIds.length;
  }

  const programmes = await prisma.programme.findMany({
    select: { id: true, name: true, leadInstitution: true },
  });

  const programmeReport: { name: string; raw: string; resolvedTo: string | null }[] = [];
  for (const programme of programmes) {
    const resolution = resolveInstitutionSources(programme.leadInstitution);
    const slug = resolution.slugs[0];
    const institutionId = slug ? CANONICAL_INSTITUTIONS[slug].id : null;
    programmeReport.push({
      name: programme.name,
      raw: programme.leadInstitution,
      resolvedTo: slug ? CANONICAL_INSTITUTIONS[slug].name : null,
    });
    if (!dryRun && institutionId) {
      await prisma.programme.update({ where: { id: programme.id }, data: { leadInstitutionId: institutionId } });
    }
  }

  const datasetCorrections: string[] = [];
  for (const correction of DATASET_OWNER_CORRECTIONS) {
    const dataset = await prisma.dataset.findUnique({
      where: { id: correction.datasetId },
      select: { id: true, name: true, ownerInstitutionId: true },
    });
    if (!dataset) continue;
    const target = CANONICAL_INSTITUTIONS[correction.ownerSlug].id;
    if (dataset.ownerInstitutionId === target) continue;
    datasetCorrections.push(`${dataset.name} -> ${CANONICAL_INSTITUTIONS[correction.ownerSlug].name}`);
    if (!dryRun) {
      await prisma.dataset.update({ where: { id: dataset.id }, data: { ownerInstitutionId: target } });
    }
  }

  console.log(dryRun ? "DRY RUN - nothing written\n" : "Applied\n");
  console.log(`Active KPIs:                 ${kpis.length}`);
  console.log(`KPI -> institution links:    ${linked}`);
  console.log(`KPIs with no institution:    ${kpisWithNoLink}`);
  console.log(`Programmes:                  ${programmes.length}`);
  console.log(`Dataset owner corrections:   ${datasetCorrections.length}`);

  if (datasetCorrections.length > 0) {
    console.log(`\nDataset owners corrected:`);
    for (const line of datasetCorrections) console.log(`  ${line}`);
  }

  console.log(`\nProgramme lead institutions:`);
  for (const row of programmeReport) {
    console.log(`  ${row.resolvedTo ? "OK  " : "GAP "} ${row.name} | "${row.raw}" -> ${row.resolvedTo ?? "UNRESOLVED"}`);
  }

  if (discoCollectiveReport.length > 0) {
    console.log(`\nKPIs sourced from DisCos collectively (linked to all ${discoIds.length} DisCos):`);
    for (const code of discoCollectiveReport) console.log(`  ${code}`);
  }

  if (nonInstitutionReport.length > 0) {
    console.log(`\nSource text naming a publication rather than an institution (needs manual review):`);
    for (const row of nonInstitutionReport) {
      console.log(`  ${row.code} | "${row.raw}" | ${row.nonInstitution.join("; ")}`);
    }
  }

  if (unresolvedReport.length > 0) {
    console.log(`\nUNRESOLVED source text (add an alias or create the institution):`);
    for (const row of unresolvedReport) {
      console.log(`  ${row.code} | "${row.raw}" | ${row.unresolved.join("; ")}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`\nNo unresolved source institution text.`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
