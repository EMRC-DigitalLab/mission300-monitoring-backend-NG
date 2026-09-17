import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsString, Matches, MinLength } from "class-validator";
import { KpiReadinessTier } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Matches pillarIdSchema exactly (m300-frontend/src/api/schemas/common.ts) -
// already the same casing as Pillar.slug in this schema, no translation needed.
const PILLAR_SLUGS = [
  "generation-network",
  "last-mile-access",
  "financially-viable-utilities",
  "private-sector-participation",
  "regional-integration",
  "clean-cooking",
];

// Matches createKpiRequestSchema exactly - a new indicator starts with no
// baseline/target/current value at all (those arrive later, through
// PATCH .../kpis/:id or a data submission - never typed in at creation).
export class CreateKpiDto {
  @IsString()
  @MinLength(3, { message: "Give the indicator an identifier, e.g. M300-P1-020" })
  @Matches(/^[A-Za-z0-9-]+$/, { message: "Use letters, numbers and hyphens only" })
  id!: string;

  @IsString()
  @MinLength(3, { message: "Give the indicator a name" })
  name!: string;

  @IsIn(PILLAR_SLUGS, { message: "Select a valid pillar" })
  pillar!: string;

  @IsString()
  @MinLength(1, { message: "Select a category" })
  category!: string;

  @IsString()
  @MinLength(1, { message: "State the unit, e.g. % or MW" })
  unit!: string;

  @IsString()
  @MinLength(10, { message: "Describe what this indicator measures" })
  definition!: string;

  @IsString()
  @MinLength(1, { message: "State how it is calculated" })
  formula!: string;

  @IsString()
  @MinLength(1, { message: "State the reporting frequency" })
  frequency!: string;

  @IsString()
  @MinLength(1, { message: "Name the responsible institution" })
  sourceInstitution!: string;

  @IsString()
  @MinLength(1, { message: "Name the dataset it is measured from" })
  sourceDataset!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(KpiReadinessTier), "readiness") : value,
  )
  @IsEnum(KpiReadinessTier)
  readiness!: KpiReadinessTier;
}
