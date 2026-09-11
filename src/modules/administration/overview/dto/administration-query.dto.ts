import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Matches administrationQuerySchema (8 filters) plus the 4 pagination
// params api.ts always sends (usersPage/scopePage/auditPage/pageSize) -
// see m300-frontend/src/features/administration/api.ts. Every filter is a
// plain string here (not an enum) because "all" is a valid sentinel value
// for each one, alongside a real enum member or free-form id - validating/
// parsing happens in overview.service.ts, where "all" is meaningful.
export class AdministrationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  accountStatus?: string;

  @IsOptional()
  @IsString()
  permission?: string;

  @IsOptional()
  @IsString()
  accessScope?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  auditPeriod?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usersPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  scopePage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  auditPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
