import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ReviewDecisionType, SubmissionStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";
import { assertValidTransition } from "@/modules/submissions/submissions.state-machine";
import { scopeInstitutionFilter, assertInstitutionMembership } from "@/common/guards/institution-scope.guard";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { CreateSubmissionDto } from "@/modules/submissions/dto/create-submission.dto";
import type { RecordDecisionDto } from "@/modules/submissions/dto/record-decision.dto";

const DECISION_TO_STATUS: Record<ReviewDecisionType, SubmissionStatus> = {
  [ReviewDecisionType.APPROVE]: SubmissionStatus.APPROVED,
  [ReviewDecisionType.PROVISIONALLY_APPROVE]: SubmissionStatus.PROVISIONALLY_APPROVED,
  [ReviewDecisionType.RETURN_FOR_CORRECTION]: SubmissionStatus.RETURNED,
  [ReviewDecisionType.REJECT]: SubmissionStatus.REJECTED,
};

const VALUE_WRITING_DECISIONS = new Set<ReviewDecisionType>([
  ReviewDecisionType.APPROVE,
  ReviewDecisionType.PROVISIONALLY_APPROVE,
]);

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitmqService,
    private readonly securitySettings: SecuritySettingsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateSubmissionDto) {
    if (!user.institutionId) {
      throw new ForbiddenException("Only institutional users can create submissions");
    }

    return this.prisma.submission.create({
      data: {
        institutionId: user.institutionId,
        submittedById: user.id,
        method: dto.method,
        status: SubmissionStatus.DRAFT,
        items: {
          create: dto.items.map((item) => ({
            kpiDefinitionId: item.kpiDefinitionId,
            period: item.period,
            value: item.value,
          })),
        },
      },
      include: { items: true },
    });
  }

  async listForUser(user: AuthenticatedUser) {
    return this.prisma.submission.findMany({
      where: scopeInstitutionFilter(user),
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async submit(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.findOwned(user, submissionId);
    assertValidTransition(submission.status, SubmissionStatus.PENDING);

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.PENDING },
    });
  }

  async startReview(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.findOwned(user, submissionId);
    assertValidTransition(submission.status, SubmissionStatus.UNDER_REVIEW);

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.UNDER_REVIEW },
    });
  }

  /**
   * The one place a review decision is written AND, if it's an approval,
   * the one place live KpiValues are derived from submitted data. Both
   * happen in a single transaction so a KPI value can never exist without
   * a matching decision, or vice versa.
   */
  async recordDecision(user: AuthenticatedUser, submissionId: string, dto: RecordDecisionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId, ...scopeInstitutionFilter(user) },
      include: { items: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    assertInstitutionMembership(user, submission.institutionId);
    if (submission.submittedById === user.id && !(await this.securitySettings.get()).allowSelfReview) {
      throw new ForbiddenException("Self-review is disabled by the system administrator");
    }

    const targetStatus = DECISION_TO_STATUS[dto.decision];
    assertValidTransition(submission.status, targetStatus);

    return this.prisma.$transaction(async (tx) => {
      await tx.reviewDecision.create({
        data: {
          submissionId,
          reviewedById: user.id,
          decision: dto.decision,
          comment: dto.comment,
        },
      });

      const updated = await tx.submission.update({
        where: { id: submissionId },
        data: { status: targetStatus },
      });

      if (VALUE_WRITING_DECISIONS.has(dto.decision)) {
        const approvedAt = new Date();
        for (const item of submission.items) {
          await tx.kpiValue.upsert({
            where: { sourceSubmissionItemId: item.id },
            create: {
              kpiDefinitionId: item.kpiDefinitionId,
              institutionId: submission.institutionId,
              period: item.period,
              value: item.value,
              sourceSubmissionItemId: item.id,
              approvedAt,
            },
            update: { value: item.value, approvedAt },
          });
        }
      }

      await this.rabbitmq.publish("submission.decision_recorded", {
        submissionId,
        decision: dto.decision,
        institutionId: submission.institutionId,
      });

      return updated;
    });
  }

  private async findById(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException("Submission not found");
    return submission;
  }

  private async findOwned(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.findById(submissionId);
    const scope = scopeInstitutionFilter(user);
    if (scope.institutionId && submission.institutionId !== scope.institutionId) {
      throw new ForbiddenException("You cannot modify another institution's submission");
    }
    return submission;
  }
}
