import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ExecutionStatus } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Matches pillarIdSchema exactly (m300-frontend/src/api/schemas/common.ts).
const PILLAR_SLUGS = [
  "generation-network",
  "last-mile-access",
  "financially-viable-utilities",
  "private-sector-participation",
  "regional-integration",
  "clean-cooking",
];

// Matches createProgrammeRequestSchema exactly (programs.ts) - the quick-add
// essentials a new programme needs to exist. supportingInstitutions,
// priority and bottlenecks are not asked here; they default server-side
// (see ProgramsService.createProgramme), same scoping as
// upsertProjectRequestSchema.
export class CreateProgrammeDto {
  @IsString()
  @MinLength(3, { message: "Name the programme" })
  name!: string;

  @IsString()
  @MinLength(1, { message: "Name the lead institution" })
  leadInstitution!: string;

  @IsIn(PILLAR_SLUGS, { message: "Select a valid pillar" })
  pillar!: string;

  @IsString()
  @MinLength(10, { message: "Describe the programme objectives" })
  objectives!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(ExecutionStatus), "status") : value,
  )
  @IsEnum(ExecutionStatus)
  status!: ExecutionStatus;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  financing?: string;
}
