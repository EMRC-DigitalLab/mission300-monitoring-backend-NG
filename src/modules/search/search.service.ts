import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

export interface SearchResultItem {
  type: "kpi" | "programme" | "project";
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

/**
 * Backs the topbar's global search. Deliberately just three entity types
 * (KPIs, programmes, projects) - each already has a real, working deep link
 * from elsewhere in the app (KPI Explorer's ?kpi= profile param, a
 * programme/project detail page), unlike institutions/DisCos, which have no
 * equivalent single-record page to land on. Adding a fourth type later only
 * makes sense once such a page exists.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string | undefined): Promise<{ query: string; results: SearchResultItem[] }> {
    const query = (rawQuery ?? "").trim();
    if (query.length < MIN_QUERY_LENGTH) return { query, results: [] };

    const [kpis, programmes, projects] = await Promise.all([
      this.prisma.kpiDefinition.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
          ],
        },
        include: { pillar: true },
        take: RESULTS_PER_TYPE,
        orderBy: { name: "asc" },
      }),
      this.prisma.programme.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        include: { pillar: true },
        take: RESULTS_PER_TYPE,
        orderBy: { name: "asc" },
      }),
      this.prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { owner: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
          ],
        },
        include: { programme: true },
        take: RESULTS_PER_TYPE,
        orderBy: { name: "asc" },
      }),
    ]);

    const results: SearchResultItem[] = [
      ...kpis.map((kpi) => ({
        type: "kpi" as const,
        id: kpi.code,
        title: kpi.name,
        subtitle: `KPI · ${kpi.pillar.name}`,
        url: `/kpis?kpi=${encodeURIComponent(kpi.code)}`,
      })),
      ...programmes.map((programme) => ({
        type: "programme" as const,
        id: programme.id,
        title: programme.name,
        subtitle: `Programme · ${programme.pillar.name}`,
        url: `/programs/${programme.id}`,
      })),
      ...projects.map((project) => ({
        type: "project" as const,
        id: project.id,
        title: project.name,
        subtitle: `Project · ${project.programme.name}`,
        url: `/programs/projects/${project.id}`,
      })),
    ];

    return { query, results };
  }
}
