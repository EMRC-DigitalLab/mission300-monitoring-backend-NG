"use strict";
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
  const kpi = await prisma.kpiDefinition.findUnique({ where: { code: "M300-P2-025" } });
  console.log("KpiDefinition:", JSON.stringify(kpi, null, 2));
  if (kpi) {
    const values = await prisma.kpiValue.findMany({
      where: { kpiDefinitionId: kpi.id },
      orderBy: { period: "asc" },
    });
    console.log("KpiValues:", JSON.stringify(values, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
