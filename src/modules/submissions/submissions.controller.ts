import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { SubmissionsService } from "@/modules/submissions/submissions.service";
import { CreateSubmissionDto } from "@/modules/submissions/dto/create-submission.dto";
import { RecordDecisionDto } from "@/modules/submissions/dto/record-decision.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("submissions")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.submissions.listForUser(user);
  }

  @Roles("INSTITUTIONAL_DATA_PROVIDER")
  @Post()
  @AuditAction("submission.created")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(user, dto);
  }

  @Roles("INSTITUTIONAL_DATA_PROVIDER")
  @Post(":id/submit")
  @AuditAction("submission.submitted")
  submit(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.submissions.submit(user, id);
  }

  @Roles("DATA_REVIEWER", "VALIDATOR")
  @Post(":id/start-review")
  @AuditAction("submission.review_started")
  startReview(@Param("id") id: string) {
    return this.submissions.startReview(id);
  }

  @Roles("DATA_REVIEWER", "VALIDATOR")
  @Post(":id/decision")
  @AuditAction("submission.decision_recorded")
  recordDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RecordDecisionDto,
  ) {
    return this.submissions.recordDecision(user, id, dto);
  }
}
