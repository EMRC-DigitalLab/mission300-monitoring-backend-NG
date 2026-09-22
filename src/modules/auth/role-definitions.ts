import { Permission, RoleName } from "@prisma/client";

export const ROLE_DEFINITIONS: {
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
