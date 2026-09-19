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

// Phase A of the Programs/Bottlenecks rebuild: the consolidated Programmes ->
// Projects -> Milestones drill-down (m300-frontend/src/api/schemas/
// programs.ts). No role-gating on the mutations here - confirmed directly
// against docs/API.md's "Role enforcement is entirely client-side today"
// section, which names only KPI definition editing and branding as needing
// a real server-side check; every Programs mutation is reachable by anyone,
// same as the real mock ("No auth/role check gates this").
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
  @AuditAction("milestone.created")
  createMilestone(@Param("projectId") projectId: string, @Body() dto: CreateMilestoneDto) {
    return this.programs.createMilestone(projectId, dto);
  }

  @Post("projects")
  @AuditAction("project.created")
  createProject(@Body() dto: UpsertProjectDto) {
    return this.programs.createProject(dto);
  }

  @Patch("projects/:projectId")
  @AuditAction("project.updated")
  updateProject(@Param("projectId") projectId: string, @Body() dto: UpsertProjectDto) {
    return this.programs.updateProject(projectId, dto);
  }

  @Delete("projects/:projectId")
  @AuditAction("project.deleted")
  deleteProject(@Param("projectId") projectId: string) {
    return this.programs.deleteProject(projectId);
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
