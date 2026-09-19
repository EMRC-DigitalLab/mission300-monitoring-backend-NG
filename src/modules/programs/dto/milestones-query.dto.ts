import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class MilestonesQueryDto {
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
