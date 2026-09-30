import { IsIn, IsOptional } from "class-validator";

// Multipart form fields arrive as strings, never a real boolean - "true"/
// "false" are the only two the frontend ever sends (see
// bulk-upload-projects-page.tsx), anything else is a client bug worth
// rejecting rather than silently coercing.
export class BulkUploadDto {
  @IsOptional()
  @IsIn(["true", "false"])
  dryRun?: string;
}
