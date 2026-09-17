import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "@/common/decorators/public.decorator";
import { PrismaService } from "@/prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaHealth.pingCheck("database", this.prisma)]);
  }
}
