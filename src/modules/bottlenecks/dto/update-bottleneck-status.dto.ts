import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { BottleneckStatus } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Matches updateBottleneckStatusRequestSchema exactly - the only way to
// change a bottleneck's status once raised. A statusHistory entry is
// appended only when the status actually changes (see the service), never
// constructed directly by the caller - same reasoning as a KPI's
// current/history only changing through an approved submission.
export class UpdateBottleneckStatusDto {
  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(BottleneckStatus), "status") : value,
  )
  @IsEnum(BottleneckStatus)
  status!: BottleneckStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  followUp?: string;
}
