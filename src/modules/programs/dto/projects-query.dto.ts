import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Matches GET /api/programs/:programmeId/projects' query exactly. The real
// contract paginates this list (useProgrammeProjects sends page/pageSize
// and parses a paginated envelope) - rejecting those two as unknown
// properties made the programme detail page fail with a 400.
export class ProjectsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
