import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Matches kpiExplorerQuerySchema exactly (m300-frontend/src/api/schemas/
// kpi-explorer.ts) - verified directly against that file, not a summary.
// No `includeRetired` field - the real schema has none, despite it
// appearing in some ad-hoc mock-handler plumbing; retired KPIs are simply
// excluded from the catalogue by default with no documented way to
// include them.
export class KpiExplorerQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  pillar?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  readiness?: string;

  @IsOptional()
  @IsString()
  validationStatus?: string;

  @IsOptional()
  @IsString()
  sourceInstitution?: string;

  @IsOptional()
  @IsString()
  reportingPeriod?: string;

  // Accepted for contract parity - no-op for now, same as
  // reviewers/readinessTiers were in Data Submissions before Phase 3 gave
  // reviewers a real backing source. There's no State/DisCo entity yet
  // (that's its own not-yet-built module).
  @IsOptional()
  @IsString()
  geography?: string;

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
