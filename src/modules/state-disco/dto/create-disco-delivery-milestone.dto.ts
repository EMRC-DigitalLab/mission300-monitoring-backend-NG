import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsOptional, IsString, MinLength } from "class-validator";
import { ExecutionStatus, ServiceBand } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// No real frontend contract dictates this shape - this backend's own
// admin-entry surface for Performance Improvement Plan milestones.
export class CreateDiscoDeliveryMilestoneDto {
  @IsString()
  @MinLength(1, { message: "Describe the milestone" })
  milestone!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.toUpperCase() : value))
  @IsEnum(ServiceBand)
  serviceBand!: ServiceBand;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? parseKebabEnum(value, Object.values(ExecutionStatus), "executionStatus")
      : value,
  )
  @IsEnum(ExecutionStatus)
  executionStatus?: ExecutionStatus;

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
