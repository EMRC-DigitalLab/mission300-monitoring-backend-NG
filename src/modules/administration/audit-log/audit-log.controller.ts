import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "@/prisma/prisma.service";
import { Roles } from "@/common/decorators/roles.decorator";

@ApiTags("administration/audit-log")
@ApiBearerAuth()
@Roles("SYSTEM_ADMINISTRATOR", "OVERSIGHT_USER")
@Controller("administration/audit-log")
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll(@Query("entityType") entityType?: string, @Query("entityId") entityId?: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { entityType, entityId },
      include: { actor: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
