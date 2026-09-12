import type { Prisma } from "@prisma/client";
import { toKebabCase } from "@/common/utils/enum-casing";

/** Matches learningLogEntrySchema exactly (learning-log.ts). */
export function toLearningLogEntry(
  entry: Prisma.LearningLogEntryGetPayload<{ include: { decidedBy: true } }>,
) {
  return {
    id: entry.id,
    title: entry.title,
    area: toKebabCase(entry.area),
    decision: entry.decision,
    rationale: entry.rationale,
    relatedRecord: entry.relatedRecord,
    reviewCycle: entry.reviewCycle,
    status: toKebabCase(entry.status),
    decidedBy: entry.decidedBy.fullName,
    decidedAt: entry.decidedAt.toISOString(),
  };
}
