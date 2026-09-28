import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ProgramsService } from "@/modules/programs/programs.service";
import { ProgramsQueryDto } from "@/modules/programs/dto/programs-query.dto";
import { ProjectsQueryDto } from "@/modules/programs/dto/projects-query.dto";
import { MilestonesQueryDto } from "@/modules/programs/dto/milestones-query.dto";
import { CreateProgrammeDto } from "@/modules/programs/dto/create-programme.dto";
import { CreateMilestoneDto } from "@/modules/programs/dto/create-milestone.dto";
import { UpsertProjectDto } from "@/modules/programs/dto/upsert-project.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { OPERATIONAL_MANAGERS, OPERATIONAL_WRITERS } from "@/common/guards/operational-scope";

// Phase A of the Programs/Bottlenecks rebuild: the consolidated Programmes ->
// Projects -> Milestones drill-down (m300-frontend/src/api/schemas/
// programs.ts). Mutations enforce backend roles and institution ownership.
@ApiTags("programs")
@ApiBearerAuth()
@Controller("programs")
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get("filters")
  getFilters() {
    return this.programs.getFilters();
  }

  @Get()
  getOverview(@Query() query: ProgramsQueryDto) {
    return this.programs.getOverview(query);
  }

  @Post()
  @Roles(...OPERATIONAL_MANAGERS)
  @AuditAction("programme.created")
  createProgramme(@Body() dto: CreateProgrammeDto) {
    return this.programs.createProgramme(dto);
  }

  @Get("projects/:projectId")
  getProject(@Param("projectId") projectId: string) {
    return this.programs.getProject(projectId);
  }

  @Get("projects/:projectId/milestones")
  getMilestones(@Param("projectId") projectId: string, @Query() query: MilestonesQueryDto) {
    return this.programs.getMilestonesForProject(projectId, query);
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

  // Registered after the /projects/* routes above so Nest's routing doesn't
  // treat "projects" as a :programmeId value - same ordering concern as any
  // static-vs-param route conflict.
  @Get(":programmeId")
  getProgramme(@Param("programmeId") programmeId: string) {
    return this.programs.getProgramme(programmeId);
  }

  @Get(":programmeId/projects")
  getProjectsForProgramme(@Param("programmeId") programmeId: string, @Query() query: ProjectsQueryDto) {
    return this.programs.getProjectsForProgramme(programmeId, query);
  }
}
