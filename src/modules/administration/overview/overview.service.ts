import { Injectable } from "@nestjs/common";
import { AccountStatus, Permission, RoleName, ScopeLevel } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { parseKebabEnum, toKebabCase } from "@/common/utils/enum-casing";
import type { AdministrationQueryDto } from "@/modules/administration/overview/dto/administration-query.dto";
import {
  ACTION_META,
  MODULE_LABELS,
  auditCutoff,
  paginate,
  roleReachesModule,
  toAuditEventResponse,
  toRoleDefinitionResponse,
  toScopeAssignmentResponse,
  toUserAccountResponse,
} from "@/modules/administration/overview/overview.mappers";

// Declaration order for the "Active users" summary card's per-role
// breakdown - Prisma has no stable ordering for enum values, so this is
// spelled out explicitly (matches schema.prisma's own RoleName order).
const ROLE_ORDER: readonly RoleName[] = [
  RoleName.SYSTEM_ADMINISTRATOR,
  RoleName.INSTITUTIONAL_DATA_PROVIDER,
  RoleName.DATA_REVIEWER,
  RoleName.VALIDATOR,
  RoleName.DASHBOARD_MANAGER,
  RoleName.OVERSIGHT_USER,
  RoleName.READ_ONLY_USER,
];

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [institutions, roleDefs] = await Promise.all([
      this.prisma.institution.findMany({ orderBy: { name: "asc" } }),
      this.prisma.roleDefinition.findMany(),
    ]);

    return {
      institutions: [
        { value: "all", label: "All institutions" },
        ...institutions.map((institution) => ({ value: institution.id, label: institution.name })),
      ],
      roles: [
        { value: "all", label: "All roles" },
        ...roleDefs.map((role) => ({ value: toKebabCase(role.role), label: role.label })),
      ],
      accountStatuses: withAllLabeled("statuses", Object.values(AccountStatus)),
      permissions: withAllLabeled("permissions", Object.values(Permission)),
      accessScopes: withAllLabeled("scopes", Object.values(ScopeLevel)),
      modules: [
        { value: "all", label: "All modules" },
        ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label })),
      ],
      auditPeriods: [
        { value: "last-7-days", label: "Last 7 days" },
        { value: "last-30-days", label: "Last 30 days" },
        { value: "last-90-days", label: "Last 90 days" },
        { value: "all-time", label: "All time" },
      ],
    };
  }

  async getOverview(query: AdministrationQueryDto) {
    const pageSize = Math.min(200, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const search = query.search?.trim().toLowerCase() ?? "";

    const [allUsers, roleDefs, allScopeAssignments, auditEntries] = await Promise.all([
      this.prisma.user.findMany({ include: { institution: true, scopeAssignments: true } }),
      this.prisma.roleDefinition.findMany(),
      this.prisma.scopeAssignment.findMany({ include: { user: true } }),
      // Bounded, not unlimited - a real audit trail grows forever, and
      // nothing here needs more than a recent window to be useful. Search/
      // pagination within this module all operate on this same bounded set.
      this.prisma.auditLogEntry.findMany({
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
    ]);

    const roleDefByName = new Map(roleDefs.map((role) => [role.role, role]));
    const parsedRole =
      query.role && query.role !== "all" ? parseKebabEnum(query.role, Object.values(RoleName), "role") : null;
    const parsedStatus =
      query.accountStatus && query.accountStatus !== "all"
        ? parseKebabEnum(query.accountStatus, Object.values(AccountStatus), "accountStatus")
        : null;
    const parsedPermission =
      query.permission && query.permission !== "all"
        ? parseKebabEnum(query.permission, Object.values(Permission), "permission")
        : null;
    const parsedAccessScope =
      query.accessScope && query.accessScope !== "all"
        ? parseKebabEnum(query.accessScope, Object.values(ScopeLevel), "accessScope")
        : null;
    const moduleCode = query.module ?? "all";
    const institutionFilter = query.institution ?? "all";

    // Section B - Users. Every one of the 8 filters (search + 7 dropdowns)
    // narrows this list, mirroring m300-frontend's mock handler exactly.
    const filteredUsers = allUsers.filter((user) => {
      const matchesSearch =
        !search ||
        [user.fullName, user.email, user.institution?.name ?? "", user.designation]
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesInstitution = institutionFilter === "all" || user.institutionId === institutionFilter;
      const matchesRole = !parsedRole || user.role === parsedRole;
      const matchesStatus = !parsedStatus || user.status === parsedStatus;
      const matchesPermission =
        !parsedPermission || (roleDefByName.get(user.role)?.permissions.includes(parsedPermission) ?? false);
      const matchesScope =
        !parsedAccessScope || user.scopeAssignments.some((a) => a.level === parsedAccessScope);
      const matchesModule = roleReachesModule(roleDefByName.get(user.role)?.modules ?? [], moduleCode);

      return (
        matchesSearch &&
        matchesInstitution &&
        matchesRole &&
        matchesStatus &&
        matchesPermission &&
        matchesScope &&
        matchesModule
      );
    });
    const matchingUserIds = new Set(filteredUsers.map((user) => user.id));

    // Section C - Roles. Filtered by role/permission/module only (not the
    // user-list filters above) - it's a catalogue, not a user view.
    const filteredRoles = roleDefs.filter((role) => {
      const matchesRole = !parsedRole || role.role === parsedRole;
      const matchesPermission = !parsedPermission || role.permissions.includes(parsedPermission);
      const matchesModule = roleReachesModule(role.modules, moduleCode);
      return matchesRole && matchesPermission && matchesModule;
    });
    // assignedUsers is a stable per-role reference count - computed from
    // every user regardless of the current query's filters, same as a role
    // catalogue entry would be independent of a table search.
    const assignedUsersByRole = new Map<RoleName, number>();
    for (const user of allUsers) {
      assignedUsersByRole.set(user.role, (assignedUsersByRole.get(user.role) ?? 0) + 1);
    }

    // Section D - Access Scope, scoped to users matching Section B's filters.
    const filteredScopes = allScopeAssignments.filter((assignment) => {
      if (!matchingUserIds.has(assignment.userId)) return false;
      if (parsedAccessScope && assignment.level !== parsedAccessScope) return false;
      if (
        search &&
        ![assignment.user.fullName, assignment.scope, assignment.responsibility]
          .join(" ")
          .toLowerCase()
          .includes(search)
      ) {
        return false;
      }
      return true;
    });

    // Section E - Audit Log, scoped to users matching Section B's filters.
    const cutoff = auditCutoff(query.auditPeriod ?? "last-30-days");
    const targetModuleLabel = moduleCode === "all" ? null : MODULE_LABELS[moduleCode];
    const filteredAudit = auditEntries.filter((entry) => {
      if (!matchingUserIds.has(entry.actorId)) return false;
      if (cutoff && entry.createdAt < cutoff) return false;
      if (
        targetModuleLabel &&
        (ACTION_META[entry.action]?.module ?? MODULE_LABELS.administration) !== targetModuleLabel
      ) {
        return false;
      }
      if (search) {
        const meta = ACTION_META[entry.action];
        const haystack = [
          entry.actor.fullName,
          meta?.label ?? entry.action,
          meta?.module ?? "",
          entry.entityId,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return {
      lastUpdated: new Date().toISOString(),
      summary: await this.buildSummary(allUsers, roleDefs),
      users: paginate(filteredUsers.map(toUserAccountResponse), query.usersPage ?? 1, pageSize),
      roles: filteredRoles.map((role) =>
        toRoleDefinitionResponse(role, assignedUsersByRole.get(role.role) ?? 0),
      ),
      scopeAssignments: paginate(
        filteredScopes.map(toScopeAssignmentResponse),
        query.scopePage ?? 1,
        pageSize,
      ),
      auditLog: paginate(filteredAudit.map(toAuditEventResponse), query.auditPage ?? 1, pageSize),
    };
  }

  // Section A - always computed against the FULL dataset, independent of
  // the query's filters (these are page-level KPIs, not a filtered view -
  // matching the spec's own framing: "not performance targets", i.e. a
  // fixed reference summary, not something a search box should shrink).
  private async buildSummary(
    allUsers: Awaited<ReturnType<PrismaService["user"]["findMany"]>>,
    roleDefs: Awaited<ReturnType<PrismaService["roleDefinition"]["findMany"]>>,
  ) {
    const now = new Date().toISOString();
    const provenance = (definition: string, methodology: string, source: string) => ({
      definition,
      methodology,
      source,
      lastUpdated: now,
    });

    const activeUsers = allUsers.filter((u) => u.status === AccountStatus.ACTIVE);
    const roleLabelByName = new Map(roleDefs.map((r) => [r.role, r.label]));
    const activeByRole = ROLE_ORDER.map((role) => ({
      label: roleLabelByName.get(role) ?? role,
      count: activeUsers.filter((u) => u.role === role).length,
    }));

    const pendingCount = allUsers.filter((u) => u.status === AccountStatus.PENDING).length;
    const inactiveCount = allUsers.filter((u) => u.status === AccountStatus.INACTIVE).length;
    const suspendedCount = allUsers.filter((u) => u.status === AccountStatus.SUSPENDED).length;

    const permissionsByRole = new Map(roleDefs.map((r) => [r.role, r.permissions]));
    const hasApprove = (u: (typeof allUsers)[number]) =>
      permissionsByRole.get(u.role)?.includes(Permission.APPROVE) ?? false;
    const hasAdminister = (u: (typeof allUsers)[number]) =>
      permissionsByRole.get(u.role)?.includes(Permission.ADMINISTER) ?? false;
    const approveCount = activeUsers.filter(hasApprove).length;
    const administerCount = activeUsers.filter(hasAdminister).length;
    const elevatedCount = activeUsers.filter((u) => hasApprove(u) || hasAdminister(u)).length;

    return [
      {
        id: "active-users",
        title: "Active users",
        count: activeUsers.length,
        breakdown: activeByRole,
        elevated: false,
        provenance: provenance(
          "Enabled user accounts with current access.",
          "Count unique accounts with Active status by assigned system role.",
          "User Registry",
        ),
      },
      {
        id: "inactive-accounts",
        title: "Pending, inactive or suspended",
        count: pendingCount + inactiveCount + suspendedCount,
        breakdown: [
          { label: "Pending", count: pendingCount },
          { label: "Inactive", count: inactiveCount },
          { label: "Suspended", count: suspendedCount },
        ],
        elevated: false,
        provenance: provenance(
          "Accounts not currently active.",
          "Count unique accounts by Pending, Inactive and Suspended status.",
          "User Registry",
        ),
      },
      {
        id: "configured-roles",
        title: "Configured system roles",
        count: roleDefs.length,
        breakdown: [],
        elevated: false,
        provenance: provenance(
          "Approved role definitions available for assignment.",
          "Count active unique role identifiers.",
          "Role and Permission Table",
        ),
      },
      {
        id: "elevated-rights",
        title: "Users with approval or administration rights",
        count: elevatedCount,
        breakdown: [
          { label: "Approve", count: approveCount },
          { label: "Administer", count: administerCount },
        ],
        elevated: true,
        provenance: provenance(
          "Accounts holding elevated approval or administration permissions.",
          "Count unique active users with Approve or Administer permission.",
          "User assignments and Role and Permission Table",
        ),
      },
    ];
  }
}

function withAllLabeled(noun: string, values: readonly string[]) {
  return [
    { value: "all", label: `All ${noun}` },
    ...values.map((value) => ({ value: toKebabCase(value), label: titleCase(toKebabCase(value)) })),
  ];
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
