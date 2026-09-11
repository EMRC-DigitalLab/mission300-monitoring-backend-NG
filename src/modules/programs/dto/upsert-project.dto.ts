import { Transform } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ExecutionStatus, PipelineReadiness } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

const PILLAR_SLUGS = [
  "generation-network",
  "last-mile-access",
  "financially-viable-utilities",
  "private-sector-participation",
  "regional-integration",
  "clean-cooking",
];

// Matches upsertProjectRequestSchema exactly (programs.ts) - used for both
// POST /api/programs/projects (create) and PATCH .../projects/:projectId
// (edit): the real frontend's quick-add and edit forms share this same
// shape. Scoped to the essentials shown on the Overview delivery-status
// table; everything else (budget, contacts, documents) defaults server-side
// and is only editable from the full project profile, which this endpoint
// doesn't expose. `pipelineReadiness` is nullable-but-required in the body
// (not `.optional()`), same "value may be null, but the key must be
// present" pattern as KPI Explorer's baseline/target - @ValidateIf lets
// null through while still validating a non-null value.
export class UpsertProjectDto {
  @IsString()
  @MinLength(3, { message: "Name the project" })
  name!: string;

  @IsString()
  @MinLength(1, { message: "Select a programme" })
  programmeId!: string;

  @IsString()
  @MinLength(1, { message: "Name the accountable institution" })
  owner!: string;

  @IsString()
  @MinLength(1, { message: "Name the project lead" })
  leadName!: string;

  @IsString()
  @MinLength(1, { message: "Add a location" })
  location!: string;

  @IsIn(PILLAR_SLUGS, { message: "Select a valid pillar" })
  pillar!: string;

  @Transform(({ value }) =>
    typeof value === "string"
      ? parseKebabEnum(value, Object.values(ExecutionStatus), "currentStatus")
      : value,
  )
  @IsEnum(ExecutionStatus)
  currentStatus!: ExecutionStatus;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ValidateIf((o: UpsertProjectDto) => o.pipelineReadiness !== null)
  @Transform(({ value }) =>
    typeof value === "string"
      ? parseKebabEnum(value, Object.values(PipelineReadiness), "pipelineReadiness")
      : value,
  )
  @IsEnum(PipelineReadiness)
  pipelineReadiness!: PipelineReadiness | null;
}
