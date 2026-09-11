import { IsArray, IsNotEmpty, IsString } from "class-validator";

// Matches externalStandardAlignmentSchema exactly (m300-frontend/src/api/schemas/kpi-explorer.ts).
export class ExternalStandardAlignmentDto {
  @IsString()
  @IsNotEmpty()
  standard!: string;

  @IsArray()
  @IsString({ each: true })
  inclusions!: string[];

  @IsArray()
  @IsString({ each: true })
  exclusions!: string[];

  @IsString()
  @IsNotEmpty()
  periodType!: string;

  @IsArray()
  @IsString({ each: true })
  assumptions!: string[];
}
