import { PrismaClient, RoleName, AccountStatus, Permission } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

// Display metadata + module-reachability for the 7 fixed roles - see the
// RoleDefinition model comment in schema.prisma for why this is seeded
// data, not an admin-editable table. label/permissions/modules match the
// real frontend's role table exactly (m300-frontend/src/mocks/data/
// administration.ts's administrationOverview.roles) - modules in
// particular MUST be the human-readable labels roleReachesModule() in
// overview.mappers.ts compares against ("Data Submissions & Validation"),
// not lowercase-hyphen codes, or module-based filtering silently never
// matches.
const ROLE_DEFINITIONS: {
  role: RoleName;
  label: string;
  description: string;
  permissions: Permission[];
  modules: string[];
}[] = [
  {
    role: RoleName.SYSTEM_ADMINISTRATOR,
    label: "System Administrator",
    description: "Full platform access, including user management and site configuration.",
    permissions: Object.values(Permission),
    modules: ["All modules"],
  },
  {
    role: RoleName.INSTITUTIONAL_DATA_PROVIDER,
    label: "Institutional Data Provider",
    description: "Submits data on behalf of their institution and tracks programme delivery.",
    permissions: [Permission.VIEW, Permission.SUBMIT, Permission.EDIT, Permission.EXPORT],
    modules: ["Data Submissions & Validation", "Implementation Register"],
  },
  {
    role: RoleName.DATA_REVIEWER,
    label: "Data Reviewer",
    description: "Reviews submitted data for structural and business-rule validity.",
    permissions: [Permission.VIEW, Permission.EDIT, Permission.EXPORT],
    modules: ["Data Submissions & Validation", "KPI Explorer"],
  },
  {
    role: RoleName.VALIDATOR,
    label: "Validator",
    description: "Validates and approves or rejects submitted data.",
    permissions: [Permission.VIEW, Permission.VALIDATE, Permission.EXPORT],
    modules: ["Data Submissions & Validation", "KPI Explorer"],
  },
  {
    role: RoleName.DASHBOARD_MANAGER,
    label: "Dashboard Manager",
    description: "Manages programme delivery and monitors performance dashboards.",
    permissions: [Permission.VIEW, Permission.EDIT, Permission.APPROVE, Permission.EXPORT],
    modules: ["All monitoring modules", "Reports & Exports"],
  },
  {
    role: RoleName.OVERSIGHT_USER,
    label: "Oversight User",
    description: "Monitors national progress and exports reports for oversight purposes.",
    permissions: [Permission.VIEW, Permission.EXPORT],
    modules: ["Executive Overview", "Compact pillar dashboards", "Reports & Exports"],
  },
  {
    role: RoleName.READ_ONLY_USER,
    label: "Read-Only User",
    description: "Views the national executive overview only.",
    permissions: [Permission.VIEW],
    modules: ["Executive Overview"],
  },
];

async function main() {
  for (const definition of ROLE_DEFINITIONS) {
    await prisma.roleDefinition.upsert({
      where: { role: definition.role },
      create: definition,
      update: definition,
    });
  }

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
      designation: "System Administrator",
      role: RoleName.SYSTEM_ADMINISTRATOR,
      status: AccountStatus.ACTIVE,
      passwordHash: adminPasswordHash,
    },
    update: {},
  });

  const providerPasswordHash = await argon2.hash("ChangeMe123!");
  const provider = await prisma.user.upsert({
    where: { email: "provider@m300.local" },
    create: {
      email: "provider@m300.local",
      fullName: "Seed Data Provider",
      designation: "Monitoring Officer",
      role: RoleName.INSTITUTIONAL_DATA_PROVIDER,
      status: AccountStatus.ACTIVE,
      institutionId: institution.id,
      passwordHash: providerPasswordHash,
    },
    update: {},
  });

  // One example row for Administration > Access Scope - this table is
  // read-only from the API (see ScopeAssignment's comment in schema.prisma),
  // so seed data is the only way anything shows up in it for now.
  await prisma.scopeAssignment.upsert({
    where: { id: "seed-scope-assignment" },
    create: {
      id: "seed-scope-assignment",
      userId: provider.id,
      level: "DISTRIBUTION_COMPANY",
      scope: institution.name,
      responsibility: "Submits and tracks monthly access-expansion data",
      effectiveFrom: new Date("2025-01-01T00:00:00Z"),
      active: true,
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

  // No branding seed here on purpose - BrandingService.get() lazily
  // upserts the full default row (countryName/colors/fonts/currency) on
  // its first call, so seeding a partial row here would just be a second,
  // driftable copy of the same defaults.

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
