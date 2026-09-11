import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsOptional, IsString } from "class-validator";
import { ExecutionStatus } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Narrower than create - updates a milestone's current status, achievement
// date and evidence once progress is made, without re-supplying the whole
// record.
export class UpdateDiscoDeliveryMilestoneDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? parseKebabEnum(value, Object.values(ExecutionStatus), "executionStatus")
      : value,
  )
  @IsEnum(ExecutionStatus)
  executionStatus?: ExecutionStatus;

  @IsOptional()
  @IsISO8601()
  achievedDate?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  reportingCompliance?: string;

  @IsOptional()
  @IsString()
  bottleneck?: string;
}
