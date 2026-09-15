import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import type { StakeholdersQueryDto } from "@/modules/stakeholders/dto/stakeholders-query.dto";

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMINISTRATOR: "System Administrator",
  INSTITUTIONAL_DATA_PROVIDER: "Institutional Data Provider",
  DATA_REVIEWER: "Data Reviewer",
  VALIDATOR: "Validator",
  DASHBOARD_MANAGER: "Dashboard Manager",
  OVERSIGHT_USER: "Oversight User",
  READ_ONLY_USER: "Read-Only User",
};

const INSTITUTION_INCLUDE = {
  users: true,
  ownedDatasets: true,
  obligations: { include: { dataset: true } },
} as const;

function toInstitutionType(rawType: string): string {
  const value = rawType.toLowerCase();
  if (value.includes("disco") || value.includes("distribution")) return "disco";
  if (value.includes("regulator")) return "regulator";
  if (value.includes("ministry")) return "ministry";
  if (value.includes("agency")) return "agency";
  if (value.includes("utility") || value.includes("genco") || value.includes("transmission")) return "utility";
  if (value.includes("programme") || value.includes("program") || value.includes("pmu")) return "programme-team";
  if (value.includes("federal") || value.includes("government")) return "agency";
  return "partner";
}

function toShortName(name: string): string {
  const bracketed = /\(([^)]{2,12})\)\s*$/.exec(name.trim());
  if (bracketed) return bracketed[1];

  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(of|the|and|for|ltd|plc)$/i.test(word));
  if (words.length >= 2) return words.map((word) => word[0]!.toUpperCase()).join("");
  return name.trim();
}

type InstitutionWithRelations = {
  id: string;
  name: string;
  type: string;
  updatedAt: Date;
  users: { role: string; status: string }[];
  ownedDatasets: { name: string }[];
  obligations: { dataset: { name: string } }[];
};

function toStatus(institution: InstitutionWithRelations): string {
  if (institution.users.some((user) => user.status === "ACTIVE")) return "active";
  return "pending-onboarding";
}

const withAll = (label: string, options: { value: string; label: string }[]) => [
  { value: "all", label: `All ${label}` },
  ...options,
];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))].sort((a, b) => a.localeCompare(b));
}

@Injectable()
export class StakeholdersService {
  constructor(private readonly prisma: PrismaService) {}

  findInstitutions() {
    return this.prisma.institution.findMany();
  }

  findDataCustodians() {
    return this.prisma.dataCustodian.findMany({ include: { institution: true } });
  }

  async getOverview(query: StakeholdersQueryDto) {
    const [institutionRows, custodianRows, programmes, datasets, kpis] = await Promise.all([
      this.prisma.institution.findMany({ include: INSTITUTION_INCLUDE, orderBy: { name: "asc" } }),
      this.prisma.dataCustodian.findMany({ include: { institution: true } }),
      this.prisma.programme.findMany({ select: { name: true, leadInstitution: true } }),
      this.prisma.dataset.findMany({ select: { name: true, frequency: true, templateFileName: true } }),
      this.prisma.kpiDefinition.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
    ]);

    const datasetsByName = new Map(datasets.map((dataset) => [dataset.name, dataset]));

    const institutions = institutionRows.map((institution) => {
      const roles = uniqueSorted(
        institution.users.map((user) => ROLE_LABELS[user.role] ?? user.role),
      );
      const institutionDatasets = uniqueSorted([
        ...institution.ownedDatasets.map((dataset) => dataset.name),
        ...institution.obligations.map((obligation) => obligation.dataset.name),
      ]);
      const institutionProgrammes = uniqueSorted(
        programmes
          .filter((programme) => programme.leadInstitution.trim() === institution.name.trim())
          .map((programme) => programme.name),
      );

      return {
        id: institution.id,
        name: institution.name,
        shortName: toShortName(institution.name),
        type: toInstitutionType(institution.type),
        status: toStatus(institution),
        coverage: "Not specified",
        roles: roles.length > 0 ? roles : ["No platform user assigned"],
        datasets: institutionDatasets,
        programmes: institutionProgrammes,
        lastUpdated: institution.updatedAt.toISOString(),
      };
    });

    const custodians = custodianRows.map((custodian) => {
      const dataset = datasetsByName.get(custodian.scope);
      return {
        id: custodian.id,
        dataset: custodian.scope,
        custodian: custodian.institution.name,
        focalPerson: custodian.contactName,
        frequency: dataset?.frequency ?? "Not specified",
        template: dataset?.templateFileName ?? "Not specified",
        reviewer: "Unassigned",
        validator: "Unassigned",
        status: "active",
      };
    });

    const search = query.search?.trim().toLowerCase() ?? "";
    const filtered = institutions.filter((institution) => {
      if (query.institutionType && query.institutionType !== "all" && institution.type !== query.institutionType) {
        return false;
      }
      if (query.status && query.status !== "all" && institution.status !== query.status) return false;
      if (query.role && query.role !== "all" && !institution.roles.includes(query.role)) return false;
      if (query.dataset && query.dataset !== "all" && !institution.datasets.includes(query.dataset)) return false;
      if (query.programme && query.programme !== "all" && !institution.programmes.includes(query.programme)) {
        return false;
      }
      if (query.coverage && query.coverage !== "all" && institution.coverage !== query.coverage) return false;
      if (
        search &&
        ![institution.name, institution.shortName, ...institution.roles].join(" ").toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });

    const filteredCustodians = search
      ? custodians.filter((custodian) =>
          [custodian.custodian, custodian.dataset, custodian.focalPerson]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : custodians;

    return {
      summary: {
        activeInstitutions: institutions.filter((institution) => institution.status === "active").length,
        dataCustodians: custodians.length,
        pendingOnboarding: institutions.filter((institution) => institution.status === "pending-onboarding").length,
      },
      institutions: filtered,
      custodians: filteredCustodians,
      filters: {
        institutionTypes: withAll(
          "types",
          uniqueSorted(institutions.map((institution) => institution.type)).map((type) => ({
            value: type,
            label: type
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" "),
          })),
        ),
        roles: withAll(
          "roles",
          uniqueSorted(institutions.flatMap((institution) => institution.roles)).map((role) => ({
            value: role,
            label: role,
          })),
        ),
        statuses: withAll(
          "statuses",
          uniqueSorted(institutions.map((institution) => institution.status)).map((status) => ({
            value: status,
            label: status
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" "),
          })),
        ),
        datasets: withAll(
          "datasets",
          uniqueSorted(datasets.map((dataset) => dataset.name)).map((name) => ({ value: name, label: name })),
        ),
        kpis: withAll(
          "indicators",
          kpis.map((kpi) => ({ value: kpi.code, label: `${kpi.code} — ${kpi.name}` })),
        ),
        programmes: withAll(
          "programmes",
          uniqueSorted(programmes.map((programme) => programme.name)).map((name) => ({ value: name, label: name })),
        ),
        coverageAreas: withAll(
          "coverage areas",
          uniqueSorted(institutions.map((institution) => institution.coverage)).map((coverage) => ({
            value: coverage,
            label: coverage,
          })),
        ),
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}
