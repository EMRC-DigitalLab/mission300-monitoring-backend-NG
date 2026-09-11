import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { BottleneckCategory, LifecycleStage, RegisterSeverity } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

const PILLAR_SLUGS = [
  "generation-network",
  "last-mile-access",
  "financially-viable-utilities",
  "private-sector-participation",
  "regional-integration",
  "clean-cooking",
];

// Matches createBottleneckRequestSchema exactly (bottlenecks.ts). The
// server is the source of truth for id, dateRaised, escalationStatus
// (always "not-escalated" at creation) and status (always "open") - the
// client only supplies what a person raising the issue would know, same
// scoping as the real mock's create handler.
export class CreateBottleneckDto {
  @IsString()
  @MinLength(5, { message: "Describe the issue in a few words" })
  issue!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(BottleneckCategory), "category") : value,
  )
  @IsEnum(BottleneckCategory)
  category!: BottleneckCategory;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(RegisterSeverity), "severity") : value,
  )
  @IsEnum(RegisterSeverity)
  severity!: RegisterSeverity;

  @IsIn(PILLAR_SLUGS, { message: "Select a valid pillar" })
  pillar!: string;

  @IsOptional()
  @IsString()
  linkedRecord?: string;

  @IsString()
  @MinLength(1, { message: "Select the responsible institution" })
  institution!: string;

  @Transform(({ value }) =>
    typeof value === "string"
      ? parseKebabEnum(value, Object.values(LifecycleStage), "lifecycleStage")
      : value,
  )
  @IsEnum(LifecycleStage)
  lifecycleStage!: LifecycleStage;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  followUp?: string;
}
