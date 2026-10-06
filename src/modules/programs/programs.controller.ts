import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ProgramsService } from "@/modules/programs/programs.service";
import { ProgramsQueryDto } from "@/modules/programs/dto/programs-query.dto";
import { ProjectsQueryDto } from "@/modules/programs/dto/projects-query.dto";
import { MilestonesQueryDto } from "@/modules/programs/dto/milestones-query.dto";
import { CreateProgrammeDto } from "@/modules/programs/dto/create-programme.dto";
import { CreateMilestoneDto } from "@/modules/programs/dto/create-milestone.dto";
import { UpsertProjectDto } from "@/modules/programs/dto/upsert-project.dto";
import { BulkUploadDto } from "@/modules/programs/dto/bulk-upload.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { OPERATIONAL_MANAGERS, OPERATIONAL_WRITERS } from "@/common/guards/operational-scope";

const MAX_BULK_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_BULK_UPLOAD_EXTENSIONS = [".xlsx", ".csv"];
const ALLOWED_BULK_UPLOAD_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
];

// Phase A of the Programs/Bottlenecks rebuild: the consolidated Programmes ->
// Projects -> Milestones drill-down (m300-frontend/src/api/schemas/
// programs.ts). Mutations enforce backend roles and institution ownership.
@ApiTags("programs")
@ApiBearerAuth()
@Controller("programs")
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get("filters")
  getFilters(@CurrentUser() user: AuthenticatedUser) {
    return this.programs.getFilters(user);
  }

  @Get()
  getOverview(@CurrentUser() user: AuthenticatedUser, @Query() query: ProgramsQueryDto) {
    return this.programs.getOverview(user, query);
  }

  @Post()
  @Roles(...OPERATIONAL_MANAGERS)
  @AuditAction("programme.created")
  createProgramme(@Body() dto: CreateProgrammeDto) {
    return this.programs.createProgramme(dto);
  }

  @Get("projects/:projectId")
  getProject(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string) {
    return this.programs.getProject(user, projectId);
  }

  @Get("projects/:projectId/milestones")
  getMilestones(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Query() query: MilestonesQueryDto,
  ) {
    return this.programs.getMilestonesForProject(user, projectId, query);
  }

  @Post("projects/:projectId/milestones")
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("milestone.created")
  createMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.programs.createMilestone(user, projectId, dto);
  }

  @Post("projects")
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("project.created")
  createProject(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertProjectDto) {
    return this.programs.createProject(user, dto);
  }

  @Patch("projects/:projectId")
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("project.updated")
  updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() dto: UpsertProjectDto,
  ) {
    return this.programs.updateProject(user, projectId, dto);
  }

  @Delete("projects/:projectId")
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("project.deleted")
  deleteProject(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string) {
    return this.programs.deleteProject(user, projectId);
  }

  // Registered as their own static routes (like /projects/*) so Nest's
  // routing doesn't treat "bulk-upload" as a :programmeId value either.
  // Same role gate as the upload itself - this was previously open to any
  // signed-in user, which meant a role that could never actually use the
  // template (an oversight/read-only user, say) could still pull one down.
  @Get("bulk-upload/template")
  @Roles(...OPERATIONAL_WRITERS)
  async getBulkUploadTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.programs.getProjectsBulkUploadTemplate();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="programs-projects-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Post("bulk-upload")
  @Roles(...OPERATIONAL_WRITERS)
  @ApiConsumes("multipart/form-data")
  @AuditAction("programs.bulk_uploaded")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_BULK_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
        if (
          !ALLOWED_BULK_UPLOAD_EXTENSIONS.includes(extension) ||
          !ALLOWED_BULK_UPLOAD_MIME_TYPES.includes(file.mimetype)
        ) {
          callback(new BadRequestException("Only .xlsx or .csv files are accepted."), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  bulkUploadProjects(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: BulkUploadDto,
  ) {
    return this.programs.bulkUploadProjects(user, file, dto.dryRun === "true");
  }

  // Registered after the /projects/* and /bulk-upload/* routes above so Nest's routing doesn't
  // treat "projects" as a :programmeId value - same ordering concern as any
  // static-vs-param route conflict.
  @Get(":programmeId")
  getProgramme(@CurrentUser() user: AuthenticatedUser, @Param("programmeId") programmeId: string) {
    return this.programs.getProgramme(user, programmeId);
  }

  @Get(":programmeId/projects")
  getProjectsForProgramme(
    @CurrentUser() user: AuthenticatedUser,
    @Param("programmeId") programmeId: string,
    @Query() query: ProjectsQueryDto,
  ) {
    return this.programs.getProjectsForProgramme(user, programmeId, query);
  }
}
