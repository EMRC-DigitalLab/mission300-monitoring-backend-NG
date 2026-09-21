import { Transform } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsString, MinLength } from "class-validator";

export class BulkRecordValidationDecisionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  submissionIds!: string[];

  @IsIn(["approved", "provisional", "returned", "rejected"])
  decision!: "approved" | "provisional" | "returned" | "rejected";

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  comments!: string;
}
