import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { PrismaService } from "@/prisma/prisma.service";
import { EmailService } from "@/notifications/email/email.service";
import { WebhooksService } from "@/notifications/webhooks/webhooks.service";
import { submissionDecisionEmail, userInvitedEmail, reportReadyEmail } from "@/notifications/email/templates";

/**
 * Single subscriber for every notification-worthy domain event, fanning
 * each one out to both channels (email + webhook). Adding a new
 * notification later means one more `case`, not new plumbing - both
 * channels already run off this one RabbitMQ subscription.
 */
@Injectable()
export class NotificationsConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitmqService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly webhooks: WebhooksService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.subscribe(
      "notifications.dispatch",
      ["submission.decision_recorded", "user.invited", "report.ready"],
      (payload, event) => this.handle(event, payload),
    );
  }

  private async handle(event: string, payload: unknown): Promise<void> {
    // Webhooks always fire, regardless of whether we also have an email
    // recipient for this particular event - the two channels are independent.
    await this.webhooks.dispatch(event, payload);

    switch (event) {
      case "submission.decision_recorded":
        return this.notifySubmissionDecision(payload as { submissionId: string });
      case "user.invited":
        return this.notifyUserInvited(payload as { userId: string; email: string });
      case "report.ready":
        return this.notifyReportReady(payload as { reportId: string });
    }
  }

  private async notifySubmissionDecision({ submissionId }: { submissionId: string }) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        institution: true,
        submittedBy: true,
        reviewDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const latestDecision = submission?.reviewDecisions[0];
    if (!submission || !latestDecision) return;

    const { subject, html } = submissionDecisionEmail({
      institutionName: submission.institution.name,
      decision: latestDecision.decision,
      comment: latestDecision.comment,
    });
    await this.email.send({ to: submission.submittedBy.email, subject, html });
  }

  private async notifyUserInvited({ userId }: { userId: string; email: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const { subject, html } = userInvitedEmail({ fullName: user.fullName });
    await this.email.send({ to: user.email, subject, html });
  }

  private async notifyReportReady({ reportId }: { reportId: string }) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { requestedBy: true },
    });
    if (!report) return;

    const { subject, html } = reportReadyEmail({ reportType: report.type });
    await this.email.send({ to: report.requestedBy.email, subject, html });
  }
}
