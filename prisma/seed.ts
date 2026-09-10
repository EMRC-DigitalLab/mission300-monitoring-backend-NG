import { PrismaClient, RoleName } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

async function main() {
  const institution = await prisma.institution.upsert({
    where: { id: "seed-institution" },
    create: { id: "seed-institution", name: "Sample DisCo", type: "Disco" },
    update: {},
  });

  const adminPasswordHash = await argon2.hash("ChangeMe123!");
  await prisma.user.upsert({
    where: { email: "admin@m300.local" },
    create: {
      email: "admin@m300.local",
      fullName: "Seed Administrator",
      role: RoleName.SYSTEM_ADMINISTRATOR,
      passwordHash: adminPasswordHash,
    },
    update: {},
  });

  const providerPasswordHash = await argon2.hash("ChangeMe123!");
  await prisma.user.upsert({
    where: { email: "provider@m300.local" },
    create: {
      email: "provider@m300.local",
      fullName: "Seed Data Provider",
      role: RoleName.INSTITUTIONAL_DATA_PROVIDER,
      institutionId: institution.id,
      passwordHash: providerPasswordHash,
    },
    update: {},
  });

  const pillar = await prisma.pillar.upsert({
    where: { name: "Access Expansion" },
    create: { name: "Access Expansion", description: "Electricity access delivery" },
    update: {},
  });

  await prisma.kpiDefinition.upsert({
    where: { code: "access-rate-national" },
    create: {
      code: "access-rate-national",
      name: "National Electricity Access Rate",
      unit: "%",
      pillarId: pillar.id,
    },
    update: {},
  });

  await prisma.brandingSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  console.log("Seed complete. Login as admin@m300.local / provider@m300.local, password: ChangeMe123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
