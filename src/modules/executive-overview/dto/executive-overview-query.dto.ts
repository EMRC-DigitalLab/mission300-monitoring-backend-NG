import { IsOptional, IsString } from "class-validator";

// Matches executiveOverviewQuerySchema exactly (dashboardFilterValuesSchema.
// partial()) - the global filter bar's values, all optional. Only `pillar`
// and `institution` actually narrow anything here (docs/API.md: "Headline
// outcomes remain national even when a pillar filter is applied - only
// Sections C and D narrow to the selected pillar"); the rest are accepted
// for contract parity and are no-ops, same pattern as KPI Explorer's
// `geography` param.
export class ExecutiveOverviewQueryDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  pillar?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  geographicScope?: string;

  @IsOptional()
  @IsString()
  distributionCompany?: string;

  @IsOptional()
  @IsString()
  technology?: string;
}
