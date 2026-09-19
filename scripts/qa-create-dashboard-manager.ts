import { PrismaClient, RoleName, AccountStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

async function main() {
  const institution = await prisma.institution.upsert({
    where: { id: "seed-institution" },
    create: { id: "seed-institution", name: "Sample DisCo", type: "Disco" },
    update: {},
  });

  const passwordHash = await argon2.hash("ChangeMe123!");
  await prisma.user.upsert({
    where: { email: "dashboard-qa@m300.local" },
    create: {
      email: "dashboard-qa@m300.local",
      fullName: "QA Dashboard Manager",
      designation: "Dashboard Manager",
      role: RoleName.DASHBOARD_MANAGER,
      status: AccountStatus.ACTIVE,
      institutionId: institution.id,
      passwordHash,
    },
    update: {
      role: RoleName.DASHBOARD_MANAGER,
      roles: [RoleName.DASHBOARD_MANAGER],
      status: AccountStatus.ACTIVE,
      passwordHash,
    },
  });

  console.log("dashboard-qa@m300.local ready");
}

main().finally(() => prisma.$disconnect());
