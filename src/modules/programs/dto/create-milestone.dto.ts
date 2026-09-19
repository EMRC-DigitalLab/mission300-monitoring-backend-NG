import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { BottleneckCategory, ExecutionStatus, RegisterPriority } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

export class CreateMilestoneDto {
  @IsString()
  @MinLength(1, { message: "Name the milestone" })
  name!: string;

  @IsString()
  @MinLength(1, { message: "Name the lead institution" })
  leadInstitution!: string;

  @IsISO8601()
  expectedDate!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(RegisterPriority), "priority") : value,
  )
  @IsOptional()
  @IsEnum(RegisterPriority)
  priority?: RegisterPriority;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(ExecutionStatus), "status") : value,
  )
  @IsOptional()
  @IsEnum(ExecutionStatus)
  status?: ExecutionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  risk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nextAction?: string;

  @ValidateIf((o: CreateMilestoneDto) => o.bottleneckCategory !== null && o.bottleneckCategory !== undefined)
  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(BottleneckCategory), "bottleneckCategory") : value,
  )
  @IsEnum(BottleneckCategory)
  bottleneckCategory?: BottleneckCategory | null;
}
