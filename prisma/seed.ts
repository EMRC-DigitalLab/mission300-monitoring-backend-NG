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
