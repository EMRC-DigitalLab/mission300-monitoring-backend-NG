import { IsNotEmpty, IsNumber, IsString } from "class-validator";

// Matches kpiTargetPointSchema exactly (m300-frontend/src/api/schemas/kpi-explorer.ts).
export class KpiTargetPointDto {
  @IsString()
  @IsNotEmpty()
  period!: string;

  @IsNumber()
  value!: number;

  @IsString()
  @IsNotEmpty()
  label!: string;
}
