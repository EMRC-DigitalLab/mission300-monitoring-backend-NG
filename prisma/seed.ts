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

  // Matches pillarIdSchema in m300-frontend/src/api/schemas/common.ts
  // exactly - all 6, not just the one the old seed had ("Access Expansion",
  // which matched none of the real slugs).
  const PILLARS: { slug: string; name: string }[] = [
    { slug: "generation-network", name: "Generation & network" },
    { slug: "last-mile-access", name: "Last-mile access" },
    { slug: "financially-viable-utilities", name: "Financially Viable Utilities" },
    { slug: "private-sector-participation", name: "Private sector" },
    { slug: "regional-integration", name: "Regional integration" },
    { slug: "clean-cooking", name: "Clean cooking" },
  ];
  const pillarsBySlug = new Map<string, Awaited<ReturnType<typeof prisma.pillar.upsert>>>();
  for (const p of PILLARS) {
    const row = await prisma.pillar.upsert({
      where: { slug: p.slug },
      create: p,
      update: { name: p.name },
    });
    pillarsBySlug.set(p.slug, row);
  }
  const lastMileAccess = pillarsBySlug.get("last-mile-access")!;

  // Real KPI Explorer contract fields all filled with real values (not
  // left at the column defaults) - several are required non-empty
  // strings on the frontend's own schema (definition/formula/unit/
  // sourceInstitution/sourceDataset/category), so a seed row left at
  // "" would violate the real contract the moment this KPI is exposed.
  const accessRateKpi = await prisma.kpiDefinition.upsert({
    where: { code: "access-rate-national" },
    create: {
      code: "access-rate-national",
      name: "National Electricity Access Rate",
      unit: "%",
      pillarId: lastMileAccess.id,
      category: "Outcome",
      readiness: "CORE",
      definition: "Percentage of Nigerian households with a grid or off-grid electricity connection.",
      formula: "(Connected households / Total households) x 100",
      aggregation: "National average, weighted by household count",
      frequency: "Quarterly",
      disaggregation: "By state and by Distribution Company",
      limitations: "Off-grid connections are self-reported by institutions and not independently metered.",
      sourceInstitution: "Sample DisCo",
      sourceDataset: "Quarterly Electricity Access Expansion",
      sourceReference: "M300 KPI Matrix v2.0",
      baseline: 45.2,
      baselineLabel: "45.2% (2025 baseline)",
      target: 90,
      targetLabel: "90% national access by 2030",
      targetDate: "2030",
      targetBasis: "LEVEL",
    },
    update: {},
  });

  // Executive Overview reads every headline/channel/bullet-metric figure
  // from a real KpiDefinition (see executive-overview.mappers.ts's header
  // comment) - unlike the frontend mock, which hardcodes two of the four
  // headline cards with literal fabricated numbers and no real backing KPI
  // at all. These 12 codes are the well-known indicators that page's
  // service looks up by code; each is real test fixture data (clearly
  // placeholder, not actual Nigeria figures), same category as
  // access-rate-national above. `target` is left null for generation
  // capacity and grid connections specifically - the real spec states
  // neither has a single approved Compact target.
  const EXEC_OVERVIEW_KPIS: {
    code: string;
    name: string;
    unit: string;
    pillarSlug: string;
    category: string;
    definition: string;
    formula: string;
    sourceInstitution: string;
    sourceDataset: string;
    baseline: number | null;
    baselineLabel: string;
    target: number | null;
    targetLabel: string;
    targetDate: string;
    direction?: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  }[] = [
    {
      code: "generation-capacity-available",
      name: "Available Generation Capacity",
      unit: "MW",
      pillarSlug: "generation-network",
      category: "Output",
      definition: "GenCo-declared available generation capacity before real-time constraints.",
      formula: "Sum of available capacity declared by generating companies",
      sourceInstitution: "Nigerian Independent System Operator",
      sourceDataset: "Daily Generation Availability Return",
      baseline: 8500,
      baselineLabel: "8,500 MW (2025 baseline)",
      target: null,
      targetLabel: "Tracked against an approved Integrated Resource Plan projection when available",
      targetDate: "",
    },
    {
      code: "people-electricity-access",
      name: "People With Electricity Access",
      unit: "people",
      pillarSlug: "last-mile-access",
      category: "Outcome",
      definition: "Cumulative number of people with electricity access across grid, mini-grid and solar home system solutions.",
      formula: "Connections across all electrification routes, converted to people using the national household-size methodology",
      sourceInstitution: "Rural Electrification Agency",
      sourceDataset: "Compact Progress Report",
      baseline: 86_600_000,
      baselineLabel: "86.6M baseline (2024)",
      target: 236_700_000,
      targetLabel: "236.7M by 2030",
      targetDate: "2030",
    },
    {
      code: "clean-cooking-access",
      name: "Clean Cooking Access",
      unit: "%",
      pillarSlug: "clean-cooking",
      category: "Outcome",
      definition: "Share of Nigeria's population with access to clean fuels and technologies for cooking.",
      formula: "(Population with clean cooking access / Total population) x 100",
      sourceInstitution: "Federal Ministry of Environment",
      sourceDataset: "Compact Progress Report",
      baseline: 22,
      baselineLabel: "22% baseline (2024)",
      target: 100,
      targetLabel: "100% by 2030",
      targetDate: "2030",
    },
    {
      code: "grid-connections",
      name: "New Grid Connections",
      unit: "connections",
      pillarSlug: "last-mile-access",
      category: "Output",
      definition: "Active registered grid customers, current period vs. comparable prior period.",
      formula: "Current active registered grid customers minus comparable prior-period active registered customers",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "Monthly Metering Factsheet",
      baseline: 0,
      baselineLabel: "No prior-period baseline recorded yet",
      target: null,
      targetLabel: "Annual grid-connection target to be confirmed",
      targetDate: "",
    },
    {
      code: "mini-grid-connections",
      name: "Active Mini-Grid Household Connections",
      unit: "connections",
      pillarSlug: "last-mile-access",
      category: "Output",
      definition: "Cumulative active household connections served by operational mini-grids.",
      formula: "Cumulative active household connections under DARES",
      sourceInstitution: "Rural Electrification Agency",
      sourceDataset: "DARES Programme Records",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 750_000,
      targetLabel: "750,000 household connections by 2030",
      targetDate: "2030",
    },
    {
      code: "solar-home-systems",
      name: "Solar Home Systems Deployed",
      unit: "systems",
      pillarSlug: "last-mile-access",
      category: "Output",
      definition: "Cumulative eligible additional Solar Home Systems deployed since the approved baseline.",
      formula: "Cumulative eligible Solar Home Systems deployed through approved programmes",
      sourceInstitution: "Rural Electrification Agency",
      sourceDataset: "DARES Programme Records",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 2_750_000,
      targetLabel: "2.75 million additional systems by 2030",
      targetDate: "2030",
    },
    {
      code: "renewable-share",
      name: "Renewable Generation Share",
      unit: "%",
      pillarSlug: "generation-network",
      category: "Outcome",
      definition: "Renewable electricity generated divided by total electricity generated.",
      formula: "(Renewable generation / Total generation) x 100",
      sourceInstitution: "Nigerian Independent System Operator",
      sourceDataset: "Generation Mix Records",
      baseline: 18,
      baselineLabel: "18% (2025 baseline)",
      target: 50,
      targetLabel: "50% by 2030",
      targetDate: "2030",
    },
    {
      code: "metering-rate",
      name: "National Metering Rate",
      unit: "%",
      pillarSlug: "financially-viable-utilities",
      category: "Output",
      definition: "Total metered active customers divided by total active registered customers.",
      formula: "(Metered active customers / Active registered customers) x 100",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "Monthly Metering Factsheet",
      baseline: 52,
      baselineLabel: "52% (2025 baseline)",
      target: 100,
      targetLabel: "100% by 2027",
      targetDate: "2027",
    },
    {
      code: "atcc-losses",
      name: "Aggregate Technical, Commercial and Collection Loss Rate",
      unit: "%",
      pillarSlug: "financially-viable-utilities",
      category: "Outcome",
      definition: "Official Nigerian Electricity Regulatory Commission weighted national ATC&C loss rate.",
      formula: "Weighted national ATC&C loss rate",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "Quarterly Reports",
      baseline: 45,
      baselineLabel: "45% (2025 baseline)",
      target: null,
      targetLabel: "Compared against approved Multi-Year Tariff Order benchmarks",
      targetDate: "",
      direction: "LOWER_IS_BETTER",
    },
    {
      code: "market-remittance",
      name: "Market Remittance Performance",
      unit: "%",
      pillarSlug: "financially-viable-utilities",
      category: "Output",
      definition: "Actual remittance divided by the applicable remittance obligation.",
      formula: "(Actual remittance / Applicable obligation) x 100",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "Market Remittance Tables",
      baseline: 60,
      baselineLabel: "60% (2025 baseline)",
      target: 100,
      targetLabel: "100% remittance-obligation compliance",
      targetDate: "",
    },
    {
      code: "tariff-shortfall",
      name: "Tariff Shortfall",
      unit: "NGN billion",
      pillarSlug: "financially-viable-utilities",
      category: "Outcome",
      definition: "Approved subsidy requirement minus subsidy funded or paid.",
      formula: "Approved subsidy requirement - subsidy funded or paid",
      sourceInstitution: "Federal Ministry of Finance",
      sourceDataset: "Tariff Shortfall Tracker",
      baseline: 2200,
      baselineLabel: "NGN 2,200bn (2025 baseline)",
      target: 0,
      targetLabel: "Zero tariff shortfall by 2027",
      targetDate: "2027",
      direction: "LOWER_IS_BETTER",
    },
    {
      code: "private-capital",
      name: "Private Capital Mobilized",
      unit: "USD million",
      pillarSlug: "private-sector-participation",
      category: "Output",
      definition: "Cumulative eligible private capital mobilized for last-mile access from the January 2025 tracking baseline.",
      formula: "Cumulative eligible private capital mobilized, excluding public funding and duplicate transactions",
      sourceInstitution: "Federal Ministry of Finance",
      sourceDataset: "Private Capital Tracker",
      baseline: 0,
      baselineLabel: "0 (January 2025 baseline)",
      target: 15_500,
      targetLabel: "USD 15.5 billion by 2030",
      targetDate: "2030",
    },
  ];

  // Pillar Dashboards needs at least 4 real KPIs per pillar to pick 4
  // headline cards from (see pillar-dashboard.mappers.ts's
  // PILLAR_HEADLINE_KPI_CODES) - last-mile-access and financially-viable-
  // utilities already have enough from the Executive Overview set above;
  // these fill in the remaining four pillars. Same placeholder-fixture
  // status as everything else in this file.
  const PILLAR_DASHBOARD_KPIS: typeof EXEC_OVERVIEW_KPIS = [
    {
      code: "transmission-wheeling-capacity",
      name: "Transmission Wheeling Capacity",
      unit: "MW",
      pillarSlug: "generation-network",
      category: "Output",
      definition: "Total transmission network capacity available to wheel power between generation and distribution.",
      formula: "Sum of rated transformer and line capacity across the national grid",
      sourceInstitution: "Transmission Company of Nigeria",
      sourceDataset: "Grid Capacity Register",
      baseline: 9000,
      baselineLabel: "9,000 MW (2025 baseline)",
      target: 20_000,
      targetLabel: "20,000 MW by 2030",
      targetDate: "2030",
    },
    {
      code: "grid-reliability-index",
      name: "Grid Reliability Index",
      unit: "%",
      pillarSlug: "generation-network",
      category: "Outcome",
      definition: "Share of scheduled supply hours actually delivered without unplanned outage.",
      formula: "(Scheduled hours - unplanned outage hours) / Scheduled hours x 100",
      sourceInstitution: "Nigerian Independent System Operator",
      sourceDataset: "Grid Performance Records",
      baseline: 70,
      baselineLabel: "70% (2025 baseline)",
      target: 95,
      targetLabel: "95% by 2030",
      targetDate: "2030",
    },
    {
      code: "ppp-projects-financially-closed",
      name: "PPP Projects Financially Closed",
      unit: "projects",
      pillarSlug: "private-sector-participation",
      category: "Output",
      definition: "Cumulative public-private partnership power sector projects reaching financial close.",
      formula: "Count of PPP projects with a signed financial close agreement",
      sourceInstitution: "Federal Ministry of Finance",
      sourceDataset: "Private Capital Tracker",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 20,
      targetLabel: "20 projects by 2030",
      targetDate: "2030",
    },
    {
      code: "private-sector-jobs-created",
      name: "Private-Sector Jobs Created",
      unit: "jobs",
      pillarSlug: "private-sector-participation",
      category: "Outcome",
      definition: "Cumulative direct jobs created through private-sector electrification investment.",
      formula: "Sum of direct jobs reported by funded private-sector projects",
      sourceInstitution: "Federal Ministry of Finance",
      sourceDataset: "Private Capital Tracker",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 50_000,
      targetLabel: "50,000 jobs by 2030",
      targetDate: "2030",
    },
    {
      code: "investment-facilitation-index",
      name: "Investment Facilitation Index",
      unit: "%",
      pillarSlug: "private-sector-participation",
      category: "Output",
      definition: "Composite score of regulatory and permitting turnaround for private power-sector investment.",
      formula: "Weighted score across permitting, licensing and land-access turnaround times",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "Investment Climate Tracker",
      baseline: 40,
      baselineLabel: "40% (2025 baseline)",
      target: 80,
      targetLabel: "80% by 2030",
      targetDate: "2030",
    },
    {
      code: "cross-border-trade-volume",
      name: "Cross-Border Electricity Trade Volume",
      unit: "GWh",
      pillarSlug: "regional-integration",
      category: "Output",
      definition: "Cumulative electricity traded across Nigeria's borders under WAPP arrangements.",
      formula: "Sum of metered cross-border electricity exports and imports",
      sourceInstitution: "Nigerian Independent System Operator",
      sourceDataset: "WAPP Trade Records",
      baseline: 0,
      baselineLabel: "0 GWh (2025 baseline)",
      target: 5_000,
      targetLabel: "5,000 GWh by 2030",
      targetDate: "2030",
    },
    {
      code: "regional-interconnection-capacity",
      name: "Regional Interconnection Capacity",
      unit: "MW",
      pillarSlug: "regional-integration",
      category: "Output",
      definition: "Firm cross-border transmission interconnection capacity with neighbouring countries.",
      formula: "Sum of rated capacity on commissioned cross-border interconnectors",
      sourceInstitution: "Transmission Company of Nigeria",
      sourceDataset: "WAPP Trade Records",
      baseline: 200,
      baselineLabel: "200 MW (2025 baseline)",
      target: 1_000,
      targetLabel: "1,000 MW by 2030",
      targetDate: "2030",
    },
    {
      code: "wapp-technical-compliance-rate",
      name: "WAPP Technical Compliance Rate",
      unit: "%",
      pillarSlug: "regional-integration",
      category: "Output",
      definition: "Share of WAPP grid-code technical preconditions met for regional market participation.",
      formula: "(Preconditions met / Total preconditions) x 100",
      sourceInstitution: "Nigerian Independent System Operator",
      sourceDataset: "WAPP Trade Records",
      baseline: 30,
      baselineLabel: "30% (2025 baseline)",
      target: 100,
      targetLabel: "100% by 2028",
      targetDate: "2028",
    },
    {
      code: "regional-market-participation-milestones",
      name: "Regional Market Participation Milestones",
      unit: "%",
      pillarSlug: "regional-integration",
      category: "Outcome",
      definition: "Share of approved milestones met on the path to full WAPP regional market participation.",
      formula: "(Milestones met / Total approved milestones) x 100",
      sourceInstitution: "Nigerian Electricity Regulatory Commission",
      sourceDataset: "WAPP Trade Records",
      baseline: 10,
      baselineLabel: "10% (2025 baseline)",
      target: 100,
      targetLabel: "100% by 2029",
      targetDate: "2029",
    },
    {
      code: "improved-cookstoves-distributed",
      name: "Improved Cookstoves Distributed",
      unit: "stoves",
      pillarSlug: "clean-cooking",
      category: "Output",
      definition: "Cumulative improved biomass cookstoves distributed under approved programmes.",
      formula: "Cumulative units distributed through approved clean-cooking programmes",
      sourceInstitution: "Federal Ministry of Environment",
      sourceDataset: "Compact Progress Report",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 2_000_000,
      targetLabel: "2 million stoves by 2030",
      targetDate: "2030",
    },
    {
      code: "lpg-cylinder-penetration-rate",
      name: "LPG Cylinder Penetration Rate",
      unit: "%",
      pillarSlug: "clean-cooking",
      category: "Outcome",
      definition: "Share of households with access to an LPG cylinder through the recirculation model.",
      formula: "(Households with an active cylinder / Total households) x 100",
      sourceInstitution: "Nigerian Midstream and Downstream Petroleum Regulatory Authority",
      sourceDataset: "Compact Progress Report",
      baseline: 15,
      baselineLabel: "15% (2025 baseline)",
      target: 60,
      targetLabel: "60% by 2030",
      targetDate: "2030",
    },
    {
      code: "clean-cooking-institutions-engaged",
      name: "Clean Cooking Institutions Engaged",
      unit: "institutions",
      pillarSlug: "clean-cooking",
      category: "Output",
      definition: "Cumulative distributor and institutional partners actively engaged in clean-cooking delivery.",
      formula: "Count of active signed distribution/delivery partners",
      sourceInstitution: "Federal Ministry of Environment",
      sourceDataset: "Compact Progress Report",
      baseline: 0,
      baselineLabel: "0 (2025 baseline)",
      target: 200,
      targetLabel: "200 institutions by 2030",
      targetDate: "2030",
    },
  ];

  for (const k of [...EXEC_OVERVIEW_KPIS, ...PILLAR_DASHBOARD_KPIS]) {
    const pillar = pillarsBySlug.get(k.pillarSlug)!;
    await prisma.kpiDefinition.upsert({
      where: { code: k.code },
      create: {
        code: k.code,
        name: k.name,
        unit: k.unit,
        pillarId: pillar.id,
        category: k.category,
        readiness: "CORE",
        definition: k.definition,
        formula: k.formula,
        aggregation: "National total",
        frequency: "Quarterly",
        disaggregation: "By state and by Distribution Company",
        limitations: "Seed fixture - placeholder test data, not real Nigeria figures.",
        sourceInstitution: k.sourceInstitution,
        sourceDataset: k.sourceDataset,
        sourceReference: "Seed fixture - backs Executive Overview and Pillar Dashboards",
        baseline: k.baseline,
        baselineLabel: k.baselineLabel,
        target: k.target,
        targetLabel: k.targetLabel,
        targetDate: k.targetDate || null,
        targetBasis: "LEVEL",
        direction: k.direction ?? "HIGHER_IS_BETTER",
      },
      update: {},
    });
  }

  // State/DisCo Phase A: real Nigerian geography (37 states incl. FCT,
  // grouped by the 6 geopolitical zones) and the 11 real Distribution
  // Companies as Institution rows (type "Disco" - a DisCo is not a
  // separate entity, see schema.prisma's comment on DiscoPerformanceRecord).
  // State/zone names are real reference data, same category as Pillar
  // names - only the DisCo PERFORMANCE figures below are placeholder test
  // fixtures pending real admin entry.
  const STATES: { name: string; zone: string }[] = [
    { name: "Benue", zone: "North Central" },
    { name: "Kogi", zone: "North Central" },
    { name: "Kwara", zone: "North Central" },
    { name: "Nasarawa", zone: "North Central" },
    { name: "Niger", zone: "North Central" },
    { name: "Plateau", zone: "North Central" },
    { name: "Federal Capital Territory", zone: "North Central" },
    { name: "Adamawa", zone: "North East" },
    { name: "Bauchi", zone: "North East" },
    { name: "Borno", zone: "North East" },
    { name: "Gombe", zone: "North East" },
    { name: "Taraba", zone: "North East" },
    { name: "Yobe", zone: "North East" },
    { name: "Jigawa", zone: "North West" },
    { name: "Kaduna", zone: "North West" },
    { name: "Kano", zone: "North West" },
    { name: "Katsina", zone: "North West" },
    { name: "Kebbi", zone: "North West" },
    { name: "Sokoto", zone: "North West" },
    { name: "Zamfara", zone: "North West" },
    { name: "Abia", zone: "South East" },
    { name: "Anambra", zone: "South East" },
    { name: "Ebonyi", zone: "South East" },
    { name: "Enugu", zone: "South East" },
    { name: "Imo", zone: "South East" },
    { name: "Akwa Ibom", zone: "South South" },
    { name: "Bayelsa", zone: "South South" },
    { name: "Cross River", zone: "South South" },
    { name: "Delta", zone: "South South" },
    { name: "Edo", zone: "South South" },
    { name: "Rivers", zone: "South South" },
    { name: "Ekiti", zone: "South West" },
    { name: "Lagos", zone: "South West" },
    { name: "Ogun", zone: "South West" },
    { name: "Ondo", zone: "South West" },
    { name: "Osun", zone: "South West" },
    { name: "Oyo", zone: "South West" },
  ];
  const statesByName = new Map<string, Awaited<ReturnType<typeof prisma.state.upsert>>>();
  for (const s of STATES) {
    const row = await prisma.state.upsert({ where: { name: s.name }, create: s, update: { zone: s.zone } });
    statesByName.set(s.name, row);
  }

  const DISCOS = [
    "Abuja Electricity Distribution Company",
    "Benin Electricity Distribution Company",
    "Eko Electricity Distribution Company",
    "Enugu Electricity Distribution Company",
    "Ibadan Electricity Distribution Company",
    "Ikeja Electric",
    "Jos Electricity Distribution Company",
    "Kaduna Electricity Distribution Company",
    "Kano Electricity Distribution Company",
    "Port Harcourt Electricity Distribution Company",
    "Yola Electricity Distribution Company",
  ];
  const discosByName = new Map<string, Awaited<ReturnType<typeof prisma.institution.upsert>>>();
  for (const name of DISCOS) {
    const row = await prisma.institution.upsert({
      where: { id: `seed-disco-${name.toLowerCase().replace(/[^a-z]+/g, "-")}` },
      create: { id: `seed-disco-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, name, type: "Disco" },
      update: {},
    });
    discosByName.set(name, row);
  }

  // Two reporting periods for Ikeja Electric specifically, so a real
  // period-over-period trend can be computed (every other DisCo gets a
  // single period - honest zero-trend, not an invented comparison).
  const ikeja = discosByName.get("Ikeja Electric")!;
  await prisma.discoPerformanceRecord.upsert({
    where: { institutionId_period: { institutionId: ikeja.id, period: "Q2 2025" } },
    create: {
      institutionId: ikeja.id,
      period: "Q2 2025",
      activeCustomers: 1_450_000,
      meteredCustomers: 870_000,
      energyReceivedMwh: 620_000,
      energyBilledMwh: 470_000,
      revenueBilledNgn: 42_000_000_000,
      revenueCollectedNgn: 33_000_000_000,
      remittanceObligationNgn: 18_000_000_000,
      remittanceActualNgn: 12_000_000_000,
      allowedLossRatePercent: 18,
      atccLossRatePercent: 26.5,
      validationStatus: "CONFIRMED",
    },
    update: {},
  });
  await prisma.discoPerformanceRecord.upsert({
    where: { institutionId_period: { institutionId: ikeja.id, period: "Q3 2025" } },
    create: {
      institutionId: ikeja.id,
      period: "Q3 2025",
      activeCustomers: 1_480_000,
      meteredCustomers: 930_000,
      energyReceivedMwh: 640_000,
      energyBilledMwh: 500_000,
      revenueBilledNgn: 44_000_000_000,
      revenueCollectedNgn: 36_000_000_000,
      remittanceObligationNgn: 18_500_000_000,
      remittanceActualNgn: 14_000_000_000,
      allowedLossRatePercent: 18,
      atccLossRatePercent: 24.8,
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  const eko = discosByName.get("Eko Electricity Distribution Company")!;
  await prisma.discoPerformanceRecord.upsert({
    where: { institutionId_period: { institutionId: eko.id, period: "Q3 2025" } },
    create: {
      institutionId: eko.id,
      period: "Q3 2025",
      activeCustomers: 980_000,
      meteredCustomers: 640_000,
      energyReceivedMwh: 410_000,
      energyBilledMwh: 330_000,
      revenueBilledNgn: 31_000_000_000,
      revenueCollectedNgn: 26_500_000_000,
      remittanceObligationNgn: 13_000_000_000,
      remittanceActualNgn: 10_500_000_000,
      allowedLossRatePercent: 15,
      atccLossRatePercent: 19.2,
      validationStatus: "PROVISIONAL",
    },
    update: {},
  });

  // State/DisCo Phase B: 5 real service bands for Ikeja Electric only (a
  // DisCo is only ever included in GET .../supply-tariff once all 5 exist -
  // see state-disco.mappers.ts's toUtilityOperationsRow comment), plus a
  // couple of delivery milestones exercising both an on-track and an
  // achieved-with-evidence state.
  const IKEJA_BANDS: {
    band: "A" | "B" | "C" | "D" | "E";
    supplyHoursPerDay: number;
    tariffNgnPerKwh: number;
    intensityPercent: number;
  }[] = [
    { band: "A", supplyHoursPerDay: 20, tariffNgnPerKwh: 209.5, intensityPercent: 8 },
    { band: "B", supplyHoursPerDay: 16, tariffNgnPerKwh: 174.3, intensityPercent: 22 },
    { band: "C", supplyHoursPerDay: 12, tariffNgnPerKwh: 155.9, intensityPercent: 35 },
    { band: "D", supplyHoursPerDay: 8, tariffNgnPerKwh: 138.2, intensityPercent: 25 },
    { band: "E", supplyHoursPerDay: 4, tariffNgnPerKwh: 120.6, intensityPercent: 10 },
  ];
  for (const b of IKEJA_BANDS) {
    await prisma.discoServiceBand.upsert({
      where: { institutionId_band: { institutionId: ikeja.id, band: b.band } },
      create: {
        institutionId: ikeja.id,
        band: b.band,
        effectiveOrder: "MYTO 2024 Minor Review",
        supplyHoursPerDay: b.supplyHoursPerDay,
        tariffNgnPerKwh: b.tariffNgnPerKwh,
        intensityPercent: b.intensityPercent,
      },
      update: {},
    });
  }

  await prisma.discoDeliveryMilestone.upsert({
    where: { id: "seed-disco-milestone-ikeja-meter-rollout" },
    create: {
      id: "seed-disco-milestone-ikeja-meter-rollout",
      institutionId: ikeja.id,
      milestone: "Complete Phase 2 meter asset provider rollout in Band A/B franchise areas",
      serviceBand: "A",
      dueDate: new Date("2025-12-31T00:00:00Z"),
      executionStatus: "ON_TRACK",
      reportingCompliance: "3 of 4 quarterly submissions received on time",
      bottleneck: "",
      validationStatus: "CONFIRMED",
    },
    update: {},
  });
  await prisma.discoDeliveryMilestone.upsert({
    where: { id: "seed-disco-milestone-ikeja-band-c-upgrade" },
    create: {
      id: "seed-disco-milestone-ikeja-band-c-upgrade",
      institutionId: ikeja.id,
      milestone: "Commission Band C feeder upgrade, Q3 2025",
      serviceBand: "C",
      dueDate: new Date("2025-09-30T00:00:00Z"),
      achievedDate: new Date("2025-09-25T00:00:00Z"),
      executionStatus: "COMPLETED",
      evidenceUrl: "https://files.example.gov.ng/ikeja/band-c-feeder-upgrade-commissioning.pdf",
      reportingCompliance: "4 of 4 quarterly submissions received on time",
      bottleneck: "",
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  // One example Dataset/DatasetField/Obligation so the Data Submissions
  // module's read endpoints (GET .../datasets, .../obligations) have
  // something real to return - the manual-entry form definition is built
  // directly from these DatasetField rows.
  const accessDataset = await prisma.dataset.upsert({
    where: { id: "seed-dataset-access-expansion" },
    create: {
      id: "seed-dataset-access-expansion",
      name: "Quarterly Electricity Access Expansion",
      purpose: "Tracks new household electricity connections by DisCo each quarter.",
      pillarId: lastMileAccess.id,
      requiredDataPoints: ["New connections", "Total connected households", "Access rate (%)"],
      frequency: "Quarterly",
      ownerInstitutionId: institution.id,
      templateFileName: "quarterly-access-expansion.xlsx",
      templateVersion: 1,
    },
    update: {},
  });

  await prisma.datasetField.upsert({
    where: { id: "seed-field-access-rate" },
    create: {
      id: "seed-field-access-rate",
      datasetId: accessDataset.id,
      sectionId: "connections",
      sectionTitle: "Connections",
      label: "National Electricity Access Rate",
      helpText: "Percentage of households with a grid connection as of period end.",
      type: "NUMBER",
      required: true,
      unit: "%",
      order: 1,
      kpiDefinitionId: accessRateKpi.id,
    },
    update: {},
  });

  await prisma.obligation.upsert({
    where: {
      institutionId_datasetId_reportingPeriod: {
        institutionId: institution.id,
        datasetId: accessDataset.id,
        reportingPeriod: "Q3 2025",
      },
    },
    create: {
      institutionId: institution.id,
      datasetId: accessDataset.id,
      reportingPeriod: "Q3 2025",
      dueDate: new Date("2025-10-15T00:00:00Z"),
      focalPersonId: provider.id,
    },
    update: {},
  });

  // Programs Phase A: enough real-shaped Programme/Project/Milestone rows to
  // exercise every headline-card rule in programs.mappers.ts's
  // buildHeadlineCards() (a due-and-delayed priority milestone, a completed-
  // on-time one, a pipeline-stage project, missing evidence on both a
  // project and a milestone) - not a full copy of the frontend mock's
  // fixture set, just enough to prove the real computation live.
  const generationNetwork = pillarsBySlug.get("generation-network")!;

  const transmissionProgramme = await prisma.programme.upsert({
    where: { id: "seed-programme-transmission-rehab" },
    create: {
      id: "seed-programme-transmission-rehab",
      name: "Transmission Rehabilitation Programme",
      leadInstitution: "Transmission Company of Nigeria",
      supportingInstitutions: ["Federal Ministry of Power"],
      pillarId: generationNetwork.id,
      objectives: "Rehabilitate ageing transmission infrastructure to reduce evacuation constraints.",
      financing: "World Bank DARES facility",
      status: "DELAYED",
      priority: "PRIORITY",
      startDate: new Date("2024-02-01T00:00:00Z"),
      endDate: new Date("2027-12-31T00:00:00Z"),
      bottleneckCategory: "TECHNICAL_CONSTRAINT",
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  const miniGridProgramme = await prisma.programme.upsert({
    where: { id: "seed-programme-dares-minigrid" },
    create: {
      id: "seed-programme-dares-minigrid",
      name: "DARES Mini-Grid Cluster Rollout",
      leadInstitution: "Rural Electrification Agency",
      supportingInstitutions: ["State Ministries of Energy"],
      pillarId: lastMileAccess.id,
      objectives: "Deploy mini-grid clusters to unserved and underserved rural communities.",
      financing: "World Bank DARES facility",
      status: "ON_TRACK",
      priority: "PRIORITY",
      startDate: new Date("2024-01-15T00:00:00Z"),
      endDate: new Date("2028-01-15T00:00:00Z"),
      bottleneckCategory: null,
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  const lineUpgradeProject = await prisma.project.upsert({
    where: { id: "seed-project-north-east-line-upgrade" },
    create: {
      id: "seed-project-north-east-line-upgrade",
      programmeId: transmissionProgramme.id,
      name: "North East 330kV Line Upgrade",
      owner: "Transmission Company of Nigeria",
      leadName: "Ahmed Bello",
      location: "North East",
      latitude: 11.8333,
      longitude: 13.15,
      coverage: "Regional",
      pillarId: generationNetwork.id,
      lifecycleStage: "IMPLEMENTATION",
      programType: "CONCESSIONAL_LOAN",
      fundingSource: "World Bank DARES facility",
      fundingStructure: "Concessional loan with federal government counterpart funding",
      fundingStatus: "DISBURSING",
      pipelineReadiness: null,
      projectedStatus: "ON_TRACK",
      currentStatus: "DELAYED",
      startDate: new Date("2024-05-01T00:00:00Z"),
      endDate: new Date("2026-11-30T00:00:00Z"),
      evidenceUrl: "https://files.example.gov.ng/tcn/north-east-line-upgrade-q3.pdf",
      bottleneckCategory: "TECHNICAL_CONSTRAINT",
      comment: "Contractor mobilisation delays following the interim load-shedding protocol.",
      suggestion: "Expedite contractor mobilisation incentives and confirm a revised energisation date.",
      validationStatus: "CONFIRMED",
      description: "Upgrade of the 330kV North East evacuation line to relieve dispatch constraints.",
      budgetUsd: 42_000_000,
      disbursedUsd: 18_500_000,
      contractor: "Northline Power Contractors Ltd",
      contactName: "Ahmed Bello",
      contactEmail: "ahmed.bello@tcn.example.gov.ng",
      statusHistory: {
        create: [
          { period: "Q2 2025", status: "ON_TRACK" },
          { period: "Q3 2025", status: "DELAYED" },
        ],
      },
      documents: {
        create: [{ label: "Q3 2025 progress report", url: "https://files.example.gov.ng/tcn/north-east-line-upgrade-q3.pdf" }],
      },
      updates: {
        create: [{ date: new Date("2025-09-01T00:00:00Z"), note: "Contractor mobilised to site; tower foundation works underway." }],
      },
    },
    update: {},
  });

  const miniGridCluster4Project = await prisma.project.upsert({
    where: { id: "seed-project-dares-cluster-4" },
    create: {
      id: "seed-project-dares-cluster-4",
      programmeId: miniGridProgramme.id,
      name: "DARES Mini-Grid Cluster 4 Commissioning",
      owner: "Rural Electrification Agency",
      leadName: "Fatima Suleiman",
      location: "Cluster 4, North Central",
      latitude: 9.0833,
      longitude: 7.5333,
      coverage: "Cluster",
      pillarId: lastMileAccess.id,
      lifecycleStage: "COMMISSIONING",
      programType: "GRANT",
      fundingSource: "World Bank DARES facility",
      fundingStructure: "Results-based grant financing",
      fundingStatus: "DISBURSING",
      pipelineReadiness: null,
      projectedStatus: "ON_TRACK",
      currentStatus: "ON_TRACK",
      startDate: new Date("2024-02-01T00:00:00Z"),
      endDate: new Date("2025-12-31T00:00:00Z"),
      evidenceUrl: "https://files.example.gov.ng/rea/dares-cluster-4-commissioning.pdf",
      bottleneckCategory: null,
      comment: "None outstanding - on track for commissioning in November.",
      suggestion: "None - proceed to commissioning as scheduled.",
      validationStatus: "CONFIRMED",
      description: "Commissioning of a 400kW solar hybrid mini-grid serving four communities.",
      budgetUsd: 3_600_000,
      disbursedUsd: 3_100_000,
      contractor: "GreenGrid Nigeria Ltd",
      contactName: "Fatima Suleiman",
      contactEmail: "fatima.suleiman@rea.example.gov.ng",
      statusHistory: { create: [{ period: "Q3 2025", status: "ON_TRACK" }] },
    },
    update: {},
  });

  // Pipeline-stage project (not yet active delivery) with no evidence url -
  // exercises pipelineReadiness and the evidenceOverdue headline card.
  await prisma.project.upsert({
    where: { id: "seed-project-dares-cluster-12-pipeline" },
    create: {
      id: "seed-project-dares-cluster-12-pipeline",
      programmeId: miniGridProgramme.id,
      name: "DARES Mini-Grid Cluster 12 (Pipeline)",
      owner: "Rural Electrification Agency",
      leadName: "Fatima Suleiman",
      location: "Cluster 12, North East",
      latitude: 12.0,
      longitude: 13.7,
      coverage: "Cluster",
      pillarId: lastMileAccess.id,
      lifecycleStage: "IDENTIFICATION",
      programType: "GRANT",
      fundingSource: null,
      fundingStructure: "Results-based grant financing, subject to feasibility outcome",
      fundingStatus: "UNFUNDED",
      pipelineReadiness: "FEASIBILITY_STUDY",
      projectedStatus: "ON_TRACK",
      currentStatus: "ON_TRACK",
      startDate: new Date("2025-09-01T00:00:00Z"),
      endDate: new Date("2026-03-31T00:00:00Z"),
      evidenceUrl: null,
      bottleneckCategory: null,
      comment: "Feasibility study underway; site selection confirmed.",
      suggestion: "None - proceed with feasibility study as scheduled.",
      validationStatus: "PROVISIONAL",
      description: "Candidate 400kW solar hybrid mini-grid site, currently at feasibility study stage.",
      statusHistory: { create: [{ period: "Q3 2025", status: "ON_TRACK" }] },
    },
    update: {},
  });

  // Due, delayed priority milestone with no evidence - exercises
  // milestoneOnTime's delayed/blocked counts and evidenceOverdue together.
  await prisma.milestone.upsert({
    where: { id: "seed-milestone-north-east-energisation" },
    create: {
      id: "seed-milestone-north-east-energisation",
      projectId: lineUpgradeProject.id,
      name: "North East line upgrade energisation",
      priority: "PRIORITY",
      expectedDate: new Date("2025-08-15T00:00:00Z"),
      actualDate: null,
      status: "DELAYED",
      leadInstitution: "Transmission Company of Nigeria",
      evidenceUrl: null,
      risk: "Contractor mobilisation delays following interim load-shedding protocol.",
      nextAction: "Confirm revised energisation date with contractor.",
      bottleneckCategory: "TECHNICAL_CONSTRAINT",
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  // Completed-on-time priority milestone - exercises the completedOnTime
  // path of the milestoneOnTime headline card.
  await prisma.milestone.upsert({
    where: { id: "seed-milestone-cluster-4-sat" },
    create: {
      id: "seed-milestone-cluster-4-sat",
      projectId: miniGridCluster4Project.id,
      name: "Cluster 4 site acceptance testing",
      priority: "PRIORITY",
      expectedDate: new Date("2025-10-15T00:00:00Z"),
      actualDate: new Date("2025-10-08T00:00:00Z"),
      status: "COMPLETED",
      leadInstitution: "Rural Electrification Agency",
      evidenceUrl: "https://files.example.gov.ng/rea/dares-cluster-4-sat.pdf",
      risk: "None outstanding.",
      nextAction: "Proceed to commissioning in November.",
      bottleneckCategory: null,
      validationStatus: "CONFIRMED",
    },
    update: {},
  });

  // Bottlenecks & Exceptions Phase B: enough real-shaped Bottleneck/
  // Escalation rows to exercise every headline-alert rule in
  // bottlenecks.service.ts's getOverview() (open-high-or-critical,
  // delayed via IN_PROGRESS, blocked, a resolved one correctly excluded
  // from "open", and an overdue vs. not-yet-due escalation). One
  // bottleneck's linkedRecord is set to a real seeded project id and
  // another to a real seeded programme id, proving the linkedRecord ->
  // Programme/Project.bottlenecks[] derivation actually works live.
  const financiallyViableUtilities = pillarsBySlug.get("financially-viable-utilities")!;

  const lineUpgradeBottleneck = await prisma.bottleneck.upsert({
    where: { id: "seed-bottleneck-transmission-evacuation" },
    create: {
      id: "seed-bottleneck-transmission-evacuation",
      issue: "Transmission evacuation constraint limiting dispatch, North East",
      category: "TECHNICAL_CONSTRAINT",
      severity: "CRITICAL",
      pillarId: generationNetwork.id,
      linkedRecord: lineUpgradeProject.id,
      institution: "Transmission Company of Nigeria",
      dateRaised: new Date("2025-09-25T00:00:00Z"),
      followUp: "Line upgrade contractor mobilised; interim load-shedding protocol in place.",
      escalationStatus: "ESCALATED",
      status: "ESCALATED",
      lifecycleStage: "IMPLEMENTATION",
      statusHistory: {
        create: [
          { period: "Sep 2025", status: "OPEN" },
          { period: "Sep 2025", status: "ESCALATED" },
        ],
      },
    },
    update: {},
  });

  await prisma.bottleneck.upsert({
    where: { id: "seed-bottleneck-minigrid-financing" },
    create: {
      id: "seed-bottleneck-minigrid-financing",
      issue: "Co-investor first-loss guarantee approval outstanding",
      category: "FINANCING",
      severity: "MEDIUM",
      pillarId: lastMileAccess.id,
      linkedRecord: miniGridProgramme.id,
      institution: "Rural Electrification Agency",
      dateRaised: new Date("2025-09-20T00:00:00Z"),
      followUp: "Awaiting guarantee approval to reach financial close.",
      escalationStatus: "NOT_ESCALATED",
      status: "OPEN",
      lifecycleStage: "DESIGN",
      statusHistory: { create: [{ period: "Sep 2025", status: "OPEN" }] },
    },
    update: {},
  });

  await prisma.bottleneck.upsert({
    where: { id: "seed-bottleneck-bilateral-contracts" },
    create: {
      id: "seed-bottleneck-bilateral-contracts",
      issue: "Bilateral contracts on hold pending regulatory determination",
      category: "REGULATORY_APPROVAL",
      severity: "HIGH",
      pillarId: financiallyViableUtilities.id,
      linkedRecord: "",
      institution: "NERC",
      dateRaised: new Date("2025-08-01T00:00:00Z"),
      followUp: "Awaiting NERC board determination, next sitting Q4 2025.",
      escalationStatus: "NOT_ESCALATED",
      status: "IN_PROGRESS",
      lifecycleStage: "DESIGN",
      statusHistory: {
        create: [
          { period: "Aug 2025", status: "OPEN" },
          { period: "Sep 2025", status: "IN_PROGRESS" },
        ],
      },
    },
    update: {},
  });

  await prisma.bottleneck.upsert({
    where: { id: "seed-bottleneck-feeder-procurement" },
    create: {
      id: "seed-bottleneck-feeder-procurement",
      issue: "Procurement for feeder rehabilitation lots re-advertised",
      category: "PROCUREMENT",
      severity: "LOW",
      pillarId: generationNetwork.id,
      linkedRecord: "",
      institution: "Transmission Company of Nigeria",
      dateRaised: new Date("2025-09-30T00:00:00Z"),
      followUp: "Technical evaluation committee reconvenes next week.",
      escalationStatus: "NOT_ESCALATED",
      status: "BLOCKED",
      lifecycleStage: "PROCUREMENT",
      statusHistory: { create: [{ period: "Sep 2025", status: "OPEN" }, { period: "Oct 2025", status: "BLOCKED" }] },
    },
    update: {},
  });

  // Resolved - must NOT appear in any "open" aggregate (byCategory/
  // byLifecycleStage/byInstitution/open-high-or-critical alert).
  await prisma.bottleneck.upsert({
    where: { id: "seed-bottleneck-permit-resolved" },
    create: {
      id: "seed-bottleneck-permit-resolved",
      issue: "Environmental permit renewal overdue for mini-grid cluster",
      category: "PERMITTING",
      severity: "MEDIUM",
      pillarId: lastMileAccess.id,
      linkedRecord: "",
      institution: "Rural Electrification Agency",
      dateRaised: new Date("2025-07-22T00:00:00Z"),
      followUp: "Permit resubmitted after clarifying site boundary; awaiting response.",
      escalationStatus: "RESOLVED",
      status: "RESOLVED",
      lifecycleStage: "COMMISSIONING",
      statusHistory: {
        create: [
          { period: "Jul 2025", status: "OPEN" },
          { period: "Sep 2025", status: "IN_PROGRESS" },
          { period: "Oct 2025", status: "RESOLVED" },
        ],
      },
    },
    update: {},
  });

  await prisma.escalation.upsert({
    where: { id: "seed-escalation-transmission-budget-overdue" },
    create: {
      id: "seed-escalation-transmission-budget-overdue",
      bottleneckId: lineUpgradeBottleneck.id,
      decisionRequired: "Authorise emergency transmission line upgrade budget",
      level: "STEERING_COMMITTEE",
      owner: "Transmission Company of Nigeria",
      dueDate: new Date("2025-08-01T00:00:00Z"),
      status: "OVERDUE",
      resolution: null,
      evidenceUrl: null,
    },
    update: {},
  });

  await prisma.escalation.upsert({
    where: { id: "seed-escalation-transmission-followup-pending" },
    create: {
      id: "seed-escalation-transmission-followup-pending",
      bottleneckId: lineUpgradeBottleneck.id,
      decisionRequired: "Confirm revised energisation date with WAPP",
      level: "INSTITUTION_LEADERSHIP",
      owner: "Transmission Company of Nigeria",
      dueDate: new Date("2027-01-15T00:00:00Z"),
      status: "ESCALATED",
      resolution: null,
      evidenceUrl: null,
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
