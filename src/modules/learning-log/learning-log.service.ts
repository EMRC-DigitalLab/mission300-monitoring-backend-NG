import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { toLearningLogEntry } from "@/modules/learning-log/learning-log.mappers";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { LearningLogQueryDto } from "@/modules/learning-log/dto/learning-log-query.dto";
import type { CreateLearningLogEntryDto } from "@/modules/learning-log/dto/create-learning-log-entry.dto";

const DEFAULT_PAGE_SIZE = 25;
const ENTRY_INCLUDE = { decidedBy: true } as const;

@Injectable()
export class LearningLogService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: LearningLogQueryDto) {
    // Newest first - a decision log reads as a timeline, not a stable-
    // sorted table, matching the real mock's own handler exactly.
    const entries = await this.prisma.learningLogEntry.findMany({
      include: ENTRY_INCLUDE,
      orderBy: { decidedAt: "desc" },
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const paged = paginate(entries, page, pageSize);

    return {
      lastUpdated: entries[0]?.decidedAt.toISOString() ?? new Date().toISOString(),
      entries: {
        items: paged.items.map(toLearningLogEntry),
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  async create(user: AuthenticatedUser, dto: CreateLearningLogEntryDto) {
    const entry = await this.prisma.learningLogEntry.create({
      data: {
        title: dto.title.trim(),
        area: dto.area,
        decision: dto.decision.trim(),
        rationale: dto.rationale.trim(),
        relatedRecord: dto.relatedRecord?.trim() || null,
        reviewCycle: dto.reviewCycle.trim(),
        status: dto.status,
        decidedById: user.id,
      },
      include: ENTRY_INCLUDE,
    });

    return {
      entry: toLearningLogEntry(entry),
      message: `${entry.id} has been added to the learning log.`,
    };
  }
}
