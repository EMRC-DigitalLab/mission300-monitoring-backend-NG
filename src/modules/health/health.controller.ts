import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "@/common/decorators/public.decorator";
import { PrismaService } from "@/prisma/prisma.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { StorageService } from "@/storage/storage.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitmqService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaHealth.pingCheck("database", this.prisma)]);
  }

  @Public()
  @SkipThrottle()
  @Get("ready")
  async ready() {
    if (!this.rabbitmq.isConnected()) throw new ServiceUnavailableException("Message broker unavailable");
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.storage.checkWritable();
    } catch {
      throw new ServiceUnavailableException("Database or file storage unavailable");
    }
    return { status: "ok" };
  }
}
