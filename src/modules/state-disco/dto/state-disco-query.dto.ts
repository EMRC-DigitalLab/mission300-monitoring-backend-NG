import { IsOptional, IsString } from "class-validator";

// Matches stateDiscoQuerySchema exactly (m300-frontend/src/api/schemas/
// state-disco/common.ts) - shared across every State/DisCo endpoint.
// `distributionCompany` uses "national" as its all-DisCos sentinel, not
// "all" like every other module's convention - confirmed directly against
// the real query schema and mock handler, not assumed.
export class StateDiscoQueryDto {
  @IsOptional()
  @IsString()
  reportingPeriod?: string;

  @IsOptional()
  @IsString()
  view?: string;

  @IsOptional()
  @IsString()
  distributionCompany?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  utilityMetric?: string;

  @IsOptional()
  @IsString()
  serviceBand?: string;

  @IsOptional()
  @IsString()
  validationStatus?: string;

  @IsOptional()
  @IsString()
  source?: string;
}
