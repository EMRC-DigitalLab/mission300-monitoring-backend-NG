import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { LearningLogService } from "@/modules/learning-log/learning-log.service";
import { LearningLogQueryDto } from "@/modules/learning-log/dto/learning-log-query.dto";
import { CreateLearningLogEntryDto } from "@/modules/learning-log/dto/create-learning-log-entry.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// The Learning & Decision Log (m300-frontend/src/api/schemas/learning-
// log.ts) - added per the SE4ALL MRL alignment review. Course-correction
// decisions and their rationale, distinct from Bottlenecks & Exceptions
// (what's currently blocked). No role-gating - the real mock's handlers
// have none, and the frontend only restricts which roles see the nav
// entry, not which roles the API accepts writes from.
@ApiTags("learning-log")
@ApiBearerAuth()
@Controller("learning-log")
export class LearningLogController {
  constructor(private readonly learningLog: LearningLogService) {}

  @Get()
  getOverview(@Query() query: LearningLogQueryDto) {
    return this.learningLog.getOverview(query);
  }

  @Post()
  @AuditAction("learning_log.entry_created")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLearningLogEntryDto) {
    return this.learningLog.create(user, dto);
  }
}
