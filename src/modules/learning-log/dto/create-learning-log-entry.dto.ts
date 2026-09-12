import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { LearningLogArea, LearningLogStatus } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Matches createLearningLogEntryRequestSchema exactly (learning-log.ts).
// The server owns id, decidedBy (the current user) and decidedAt - the
// client only supplies what a person logging a decision would know, same
// scoping as the real mock's create handler.
export class CreateLearningLogEntryDto {
  @IsString()
  @MinLength(3, { message: "Give the entry a title" })
  title!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(LearningLogArea), "area") : value,
  )
  @IsEnum(LearningLogArea)
  area!: LearningLogArea;

  @IsString()
  @MinLength(10, { message: "Describe what was decided or proposed" })
  decision!: string;

  @IsString()
  @MinLength(10, { message: "Describe why" })
  rationale!: string;

  @IsOptional()
  @IsString()
  relatedRecord?: string;

  @IsString()
  @MinLength(1, { message: "Name the review cycle" })
  reviewCycle!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(LearningLogStatus), "status") : value,
  )
  @IsEnum(LearningLogStatus)
  status!: LearningLogStatus;
}
