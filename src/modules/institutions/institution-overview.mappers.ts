import type { Institution, KpiDefinition, KpiValue, Pillar, Programme, Project } from "@prisma/client";
import { toObligationView } from "@/modules/data-submissions/data-submissions.mappers";
import { toKebabCase } from "@/common/utils/enum-casing";

type ObligationView = ReturnType<typeof toObligationView>;

export function buildObligationSummary(views: ObligationView[], fulfilledCount: number) {
  const byStatus = new Map<string, { code: string; label: string; tone: string; count: number }>();
  for (const view of views) {
    const existing = byStatus.get(view.status.code);
    if (existing) existing.count += 1;
    else byStatus.set(view.status.code, { ...view.status, count: 1 });
  }
  const overdueCount = views.filter((v) => v.status.code === "overdue").length;

  return {
    total: views.length,
    byStatus: [...byStatus.values()],
    overdueCount,
    fulfilledCount,
  };
}

type KpiValueWithDefinition = KpiValue & { kpiDefinition: KpiDefinition & { pillar: Pillar } };

export function toInstitutionKpiView(latest: KpiValueWithDefinition) {
  const def = latest.kpiDefinition;
  const value = Number(latest.value);
  const target = def.target !== null ? Number(def.target) : null;
  return {
    id: def.id,
    code: def.code,
    name: def.name,
    unit: def.unit,
    pillar: def.pillar.slug,
    period: latest.period,
    value,
    target,
    targetLabel: def.targetLabel || null,
    direction: toKebabCase(def.direction) as "higher-is-better" | "lower-is-better",
    onTrack: target === null ? null : def.direction === "HIGHER_IS_BETTER" ? value >= target : value <= target,
  };
}

type ProgrammeWithPillar = Programme & { pillar: Pillar; projects: Project[] };

export function toInstitutionProgrammeView(programme: ProgrammeWithPillar) {
  return {
    id: programme.id,
    name: programme.name,
    pillar: programme.pillar.slug,
    status: toKebabCase(programme.status),
    priority: toKebabCase(programme.priority),
    startDate: programme.startDate.toISOString(),
    endDate: programme.endDate.toISOString(),
    projectCount: programme.projects.length,
  };
}

export function toInstitutionProjectView(project: Project & { pillar: Pillar; programme: Programme }) {
  return {
    id: project.id,
    name: project.name,
    programme: project.programme.name,
    pillar: project.pillar.slug,
    lifecycleStage: toKebabCase(project.lifecycleStage),
    currentStatus: toKebabCase(project.currentStatus),
    startDate: project.startDate.toISOString(),
    endDate: project.endDate?.toISOString() ?? null,
  };
}

export function toInstitutionOverviewResponse(params: {
  institution: Institution;
  obligationViews: ObligationView[];
  fulfilledCount: number;
  kpis: KpiValueWithDefinition[];
  programmes: ProgrammeWithPillar[];
  projects: (Project & { pillar: Pillar; programme: Programme })[];
}) {
  const { institution, obligationViews, fulfilledCount, kpis, programmes, projects } = params;
  return {
    institution: { id: institution.id, name: institution.name, type: institution.type },
    obligations: {
      summary: buildObligationSummary(obligationViews, fulfilledCount),
      recent: obligationViews.slice(0, 5),
    },
    kpis: kpis.map(toInstitutionKpiView),
    programmes: programmes.map(toInstitutionProgrammeView),
    projects: projects.map(toInstitutionProjectView),
  };
}
