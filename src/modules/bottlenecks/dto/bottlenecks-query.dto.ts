import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Matches GET /api/bottlenecks' real query params exactly (m300-frontend's
// mocks/handlers/bottlenecks.ts). `validationStatus`/`reportingPeriod` are
// accepted for contract parity but are no-ops here - bottleneckRecordSchema
// itself carries neither field (confirmed by reading bottlenecks.ts
// directly), same "accepted, no real backing data yet" pattern as KPI
// Explorer's `geography` query param.
export class BottlenecksQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  pillar?: string;

  @IsOptional()
  @IsString()
  linkedRecord?: string;

  @IsOptional()
  @IsString()
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  escalationStatus?: string;

  @IsOptional()
  @IsString()
  validationStatus?: string;

  @IsOptional()
  @IsString()
  reportingPeriod?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  escalationPage?: number;
}
