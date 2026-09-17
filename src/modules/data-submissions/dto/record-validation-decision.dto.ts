import { Transform } from "class-transformer";
import { IsIn, IsString, MinLength } from "class-validator";

// Matches validationDecisionRequestSchema exactly (m300-frontend/src/api/
// schemas/data-submissions/submissions.ts) - decision is already
// lower-kebab-case there (unlike RecordDecisionDto in the old submissions
// module), no enum-casing translation needed. comments is trimmed before
// the min(3) check, matching the schema's own .trim().min(3).
export class RecordValidationDecisionDto {
  @IsIn(["approved", "provisional", "returned", "rejected"])
  decision!: "approved" | "provisional" | "returned" | "rejected";

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  comments!: string;
}
