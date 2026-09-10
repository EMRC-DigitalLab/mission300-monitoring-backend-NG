import { IsEnum, IsString, MinLength } from "class-validator";
import { ReviewDecisionType } from "@prisma/client";

export class RecordDecisionDto {
  @IsEnum(ReviewDecisionType)
  decision!: ReviewDecisionType;

  // Mandatory in the UI already - enforced again here so a direct API call
  // can't skip it.
  @IsString()
  @MinLength(10, { message: "A review comment of at least 10 characters is required" })
  comment!: string;
}
