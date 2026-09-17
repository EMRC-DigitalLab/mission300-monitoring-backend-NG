import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Matches the query params m300-frontend/src/features/data-submissions/
// api.ts sends across every list endpoint in this module - not every
// endpoint uses every field (e.g. reviewer/validationStatus are Phase 3
// concerns for the validation queue), unused ones are simply ignored.
export class DataSubmissionsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  dataset?: string;

  @IsOptional()
  @IsString()
  reportingPeriod?: string;

  @IsOptional()
  @IsString()
  submissionStatus?: string;

  @IsOptional()
  @IsString()
  validationStatus?: string;

  @IsOptional()
  @IsString()
  reviewer?: string;

  @IsOptional()
  @IsString()
  readinessTier?: string;

  @IsOptional()
  @IsString()
  overdueStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
