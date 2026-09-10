import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { ConfirmChannel } from "amqplib";

/**
 * Thin wrapper around amqp-connection-manager: one topic exchange
 * (m300.events by default), auto-reconnecting. Feature modules publish
 * through this rather than opening their own connections.
 *
 * Routing key convention: "<entity>.<event>", e.g. "submission.approved".
 */
@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection!: amqp.AmqpConnectionManager;
  private channel!: ChannelWrapper;
  private readonly subscriberChannels: ChannelWrapper[] = [];
  private readonly exchange: string;

  constructor(private readonly config: ConfigService) {
    this.exchange = this.config.get<string>("RABBITMQ_EXCHANGE", "m300.events");
  }

  onModuleInit() {
    const url = this.config.getOrThrow<string>("RABBITMQ_URL");
    this.connection = amqp.connect([url]);
    this.connection.on("connect", () => this.logger.log("Connected to RabbitMQ"));
    this.connection.on("disconnect", (err) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => channel.assertExchange(this.exchange, "topic", { durable: true }),
    });
    // Without a listener, an 'error' event (e.g. the connection closing
    // while a confirm is pending) is a fatal unhandled error in Node -
    // log it instead of crashing the process.
    this.channel.on("error", (err: Error) => this.logger.warn(`Channel error: ${err.message}`));
  }

  async onModuleDestroy() {
    await Promise.all(this.subscriberChannels.map((ch) => ch.close()));
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(routingKey: string, payload: unknown): Promise<void> {
    await this.channel.publish(this.exchange, routingKey, payload);
  }

  /** For consumers: bind a queue to one or more routing patterns and handle messages. */
  async subscribe(
    queue: string,
    patterns: string[],
    handler: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    const channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(this.exchange, "topic", { durable: true });
        await ch.assertQueue(queue, { durable: true });
        for (const pattern of patterns) {
          await ch.bindQueue(queue, this.exchange, pattern);
        }
        await ch.consume(queue, async (msg) => {
          if (!msg) return;
          try {
            await handler(JSON.parse(msg.content.toString()));
            ch.ack(msg);
          } catch (error) {
            this.logger.error(`Failed to process message on ${queue}`, error as Error);
            ch.nack(msg, false, false); // dead-letter, don't requeue a poison message
          }
        });
      },
    });
    channel.on("error", (err: Error) => this.logger.warn(`Channel error on ${queue}: ${err.message}`));
    this.subscriberChannels.push(channel);
    await channel.waitForConnect();
  }
}
