import { IsOptional, IsString } from "class-validator";

export class StakeholdersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  institutionType?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dataset?: string;

  @IsOptional()
  @IsString()
  kpi?: string;

  @IsOptional()
  @IsString()
  programme?: string;

  @IsOptional()
  @IsString()
  coverage?: string;
}
