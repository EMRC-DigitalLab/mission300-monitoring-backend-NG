import { randomBytes, createHmac } from "node:crypto";
import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WebhookDeliveryStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { CreateWebhookSubscriptionDto } from "@/notifications/webhooks/dto/create-webhook-subscription.dto";
import { assertPublicWebhookUrl, WebhookUrlBlockedError } from "@/notifications/webhooks/ssrf-guard";
import { postWebhook } from "@/notifications/webhooks/webhook-transport";
import {
  assertWebhookAdministrator,
  assertWebhookPatterns,
  publicWebhookPayload,
} from "@/notifications/webhooks/webhook-policy";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateWebhookSubscriptionDto) {
    assertWebhookAdministrator(user);
    assertWebhookPatterns(dto.events);
    try {
      await assertPublicWebhookUrl(dto.url);
    } catch (error) {
      if (error instanceof WebhookUrlBlockedError) throw new BadRequestException(error.message);
      throw error;
    }

    const secret = randomBytes(32).toString("hex");
    const subscription = await this.prisma.webhookSubscription.create({
      data: { ownerId: user.id, url: dto.url, events: dto.events, secret },
    });
    // Only time the raw secret is ever returned - store it now, it can't be
    // retrieved again (same pattern as the deploy SSH key: shown once).
    return { ...subscription, secret };
  }

  listForUser(user: AuthenticatedUser) {
    assertWebhookAdministrator(user);
    return this.prisma.webhookSubscription.findMany({
      where: { ownerId: user.id },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    assertWebhookAdministrator(user);
    const subscription = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException("Webhook subscription not found");
    if (subscription.ownerId !== user.id) {
      throw new ForbiddenException("You cannot remove another user's webhook subscription");
    }
    await this.prisma.webhookSubscription.delete({ where: { id } });
  }

  /**
   * Fans an event out to every active subscription whose pattern matches
   * (simple prefix wildcard, e.g. "submission.*" matches
   * "submission.decision_recorded"). One HTTP attempt per subscription, no
   * automatic retry scheduler yet - a failed delivery is recorded and
   * visible, but re-sending is a manual/future addition, not built now.
   */
  async dispatch(event: string, payload: unknown): Promise<void> {
    const safePayload = publicWebhookPayload(event, payload);
    if (!safePayload) return;
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        isActive: true,
        owner: {
          status: "ACTIVE",
          OR: [
            { roles: { has: "SYSTEM_ADMINISTRATOR" } },
            { roles: { isEmpty: true }, role: "SYSTEM_ADMINISTRATOR" },
          ],
        },
      },
      include: { owner: { select: { id: true, role: true, roles: true, status: true } } },
    });

    const matching = subscriptions.filter((sub) => {
      if (sub.owner.status !== "ACTIVE") return false;
      try {
        assertWebhookAdministrator({ ...sub.owner, institutionId: null });
      } catch {
        return false;
      }
      return sub.events.some((pattern) => matches(pattern, event));
    });

    await Promise.all(matching.map((sub) => this.deliver(sub, event, safePayload)));
  }

  private async deliver(
    subscription: { id: string; url: string; secret: string },
    event: string,
    payload: unknown,
  ): Promise<void> {
    const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    const signature = createHmac("sha256", subscription.secret).update(body).digest("hex");

    try {
      const responseStatus = await postWebhook(subscription.url, body, signature);

      await this.recordDelivery(subscription.id, event, payload, {
        status:
          responseStatus >= 200 && responseStatus < 300
            ? WebhookDeliveryStatus.SUCCESS
            : WebhookDeliveryStatus.FAILED,
        responseStatus,
      });
    } catch (error) {
      const failure =
        error instanceof WebhookUrlBlockedError ? "Destination blocked" : "Network or TLS delivery failure";
      this.logger.warn(`Webhook delivery failed for subscription ${subscription.id}: ${failure}`);
      await this.recordDelivery(subscription.id, event, payload, {
        status: WebhookDeliveryStatus.FAILED,
        error: failure,
      });
    }
  }

  private recordDelivery(
    subscriptionId: string,
    event: string,
    payload: unknown,
    result: { status: WebhookDeliveryStatus; responseStatus?: number; error?: string },
  ) {
    return this.prisma.webhookDelivery.create({
      data: {
        subscriptionId,
        event,
        payload: payload as Prisma.InputJsonValue,
        ...result,
      },
    });
  }
}

export function matches(pattern: string, event: string): boolean {
  if (pattern === event) return true;
  if (pattern.endsWith("*")) return event.startsWith(pattern.slice(0, -1));
  return false;
}
