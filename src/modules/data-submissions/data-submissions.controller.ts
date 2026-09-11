import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApiTags, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";
import { DataSubmissionsQueryDto } from "@/modules/data-submissions/dto/data-submissions-query.dto";
import { ManualEntryDto } from "@/modules/data-submissions/dto/manual-entry.dto";
import { UploadSubmissionDto } from "@/modules/data-submissions/dto/upload-submission.dto";
import { RecordValidationDecisionDto } from "@/modules/data-submissions/dto/record-validation-decision.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // matches uploadDefinitionSchema's maxFileSizeMb

// All 3 phases of the Data Submissions rebuild: the read-only foundation,
// manual-entry/upload creation + template generation, and the validation
// queue/detail/decision endpoints - see m300-frontend's
// src/features/data-submissions/api.ts for the complete real contract
// this was built to match.
@ApiTags("data-submissions")
@ApiBearerAuth()
@Controller("data-submissions")
export class DataSubmissionsController {
  constructor(private readonly dataSubmissions: DataSubmissionsService) {}

  @Get("filters")
  getFilters() {
    return this.dataSubmissions.getFilters();
  }

  @Get("datasets")
  getDatasets() {
    return this.dataSubmissions.getDatasets();
  }

  @Get("obligations")
  getObligations(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getObligations(user, query);
  }

  @Get("submissions")
  getSubmissions(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getSubmissions(user, query);
  }

  @Get("overdue")
  getOverdue(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getOverdue(user, query);
  }

  @Get("gaps")
  getGaps(@Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getGaps(query);
  }

  @Get("obligations/:id/entry")
  getEntryDefinition(@Param("id") id: string) {
    return this.dataSubmissions.getManualEntryDefinition(id);
  }

  @Post("obligations/:id/entry")
  @AuditAction("submission.manual_entry_saved")
  saveEntry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ManualEntryDto) {
    return this.dataSubmissions.saveManualEntry(user, id, dto);
  }

  @Get("obligations/:id/upload")
  getUploadDefinition(@Param("id") id: string) {
    return this.dataSubmissions.getUploadDefinition(id);
  }

  @Post("obligations/:id/upload")
  @ApiConsumes("multipart/form-data")
  @AuditAction("submission.uploaded")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  uploadSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadSubmissionDto,
  ) {
    return this.dataSubmissions.uploadSubmission(user, id, file, dto);
  }

  @Get("templates/:fileName")
  async getTemplate(@Param("fileName") fileName: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.dataSubmissions.getTemplate(fileName);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get("validation")
  getValidationQueue(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getValidationQueue(user, query);
  }

  @Get("validation/:id")
  getSubmissionDetail(@Param("id") id: string) {
    return this.dataSubmissions.getSubmissionDetail(id);
  }

  // Same role gate as the old submissions module's decision endpoint
  // (src/modules/submissions/submissions.controller.ts) - deliberately
  // not including SYSTEM_ADMINISTRATOR, matching that existing precedent.
  @Roles("DATA_REVIEWER", "VALIDATOR")
  @Post("validation/:id/decisions")
  @AuditAction("submission.decision_recorded")
  recordDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RecordValidationDecisionDto,
  ) {
    return this.dataSubmissions.recordDecision(user, id, dto);
  }
}
