import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

// Matches setKpiActiveRequestSchema exactly (m300-frontend/src/api/schemas/kpi-explorer.ts).
export class SetKpiActiveDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
