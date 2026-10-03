import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { PILLAR_LABELS } from "@/modules/pillar-dashboard/pillar-dashboard.mappers";

/**
 * Aggregate-only project figures for the public landing page.
 *
 * Deliberately NOT the Executive Overview's `deliveryStatus` panel, which
 * this module's controller already strips before anything reaches the
 * public: that payload carries per-project delivery status (at risk /
 * delayed / blocked), owner institutions, and free-text risk commentary
 * ("Financing Risk...", etc.) - internal delivery language, much of it
 * still PROVISIONAL, some of it carrying bulk-upload placeholders. None of
 * that belongs on an unauthenticated page.
 *
 * What this returns instead is counts and nothing else: how many priority
 * projects and programmes exist, and how they split across the six Compact
 * pillars. No names, no statuses, no institutions, no comments - so there
 * is no path by which a future change to a project record can leak
 * something sensitive through this endpoint.
 */
@Injectable()
export class PublicOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectDelivery() {
    const [totalProjects, totalProgrammes, projectsByPillar] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.programme.count(),
      this.prisma.project.groupBy({ by: ["pillarId"], _count: { _all: true } }),
    ]);

    const pillars = await this.prisma.pillar.findMany({ select: { id: true, slug: true } });
    const slugById = new Map(pillars.map((pillar) => [pillar.id, pillar.slug]));

    const byPillar = projectsByPillar
      .map((group) => {
        const slug = slugById.get(group.pillarId) ?? "";
        return { pillar: slug, label: PILLAR_LABELS[slug] ?? slug, projects: group._count._all };
      })
      // A pillar whose slug no longer resolves is dropped rather than shown
      // as an unlabelled row - the public page should never render a blank
      // category name.
      .filter((entry) => entry.pillar !== "")
      .sort((left, right) => right.projects - left.projects);

    return { totalProjects, totalProgrammes, byPillar };
  }
}
