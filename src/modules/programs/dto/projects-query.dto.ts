import { IsOptional, IsString } from "class-validator";

// Matches GET /api/programs/:programmeId/projects' query exactly - not
// paginated (a programme's project list is expected to stay small).
export class ProjectsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
