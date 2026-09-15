import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { KpiTargetPointDto } from "@/modules/kpi-explorer/dto/kpi-target-point.dto";
import { ExternalStandardAlignmentDto } from "@/modules/kpi-explorer/dto/external-standard-alignment.dto";

// Matches pillarIdSchema exactly (m300-frontend/src/api/schemas/common.ts),
// same list as create-kpi.dto.ts's PILLAR_SLUGS.
const PILLAR_SLUGS = [
  "generation-network",
  "last-mile-access",
  "financially-viable-utilities",
  "private-sector-participation",
  "regional-integration",
  "clean-cooking",
];

// Matches updateKpiMetadataRequestSchema exactly (m300-frontend/src/api/
// schemas/kpi-explorer.ts) - deliberately excludes category/readiness/
// name (not editable via this endpoint) and targetBasis/targetBasisLabel/
// direction (not settable via ANY endpoint in the real contract - confirmed
// by reading the schema file directly, not assumed). Pillar reassignment IS
// part of the real contract now: moves the KpiDefinition to the given
// Pillar row (see KpiExplorerService.updateMetadata()).
// baseline/target/targetDate are nullable (required in the body, but the
// value itself may be null) - @ValidateIf lets null through while still
// validating a non-null value, unlike @IsOptional (which only skips
// validation for undefined/absent, not null).
export class UpdateKpiMetadataDto {
  @IsIn(PILLAR_SLUGS, { message: "Select a valid pillar" })
  pillar!: string;

  @IsString()
  @IsNotEmpty()
  definition!: string;

  @IsString()
  @IsNotEmpty()
  formula!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsString()
  aggregation!: string;

  @IsString()
  frequency!: string;

  @IsString()
  disaggregation!: string;

  @IsString()
  limitations!: string;

  @ValidateIf((o: UpdateKpiMetadataDto) => o.baseline !== null)
  @IsNumber()
  baseline!: number | null;

  @IsString()
  baselineLabel!: string;

  @ValidateIf((o: UpdateKpiMetadataDto) => o.target !== null)
  @IsNumber()
  target!: number | null;

  @IsString()
  targetLabel!: string;

  @ValidateIf((o: UpdateKpiMetadataDto) => o.targetDate !== null)
  @IsString()
  targetDate!: string | null;

  // Optional: omitting it leaves existing periodic targets untouched;
  // sending an array (including []) replaces the full list.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KpiTargetPointDto)
  targets?: KpiTargetPointDto[];

  // Optional: omitting it leaves the existing alignment (or lack of one)
  // untouched; sending null clears it; sending an object sets it.
  @IsOptional()
  @ValidateIf((o: UpdateKpiMetadataDto) => o.externalStandardAlignment !== null)
  @ValidateNested()
  @Type(() => ExternalStandardAlignmentDto)
  externalStandardAlignment?: ExternalStandardAlignmentDto | null;

  @IsString()
  @IsNotEmpty()
  sourceInstitution!: string;

  @IsString()
  @IsNotEmpty()
  sourceDataset!: string;

  @IsString()
  sourceReference!: string;
}
