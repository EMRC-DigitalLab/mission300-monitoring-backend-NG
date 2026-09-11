import { IsObject, IsOptional, IsString } from "class-validator";

// Matches manualEntryRequestSchema exactly (m300-frontend/src/api/schemas/
// data-submissions/obligations.ts) - sourceReference/notes have no min(1)
// there (unlike the upload endpoint, which enforces sourceReference via
// imperative code, not the schema) - both stay optional here to match.
export class ManualEntryDto {
  @IsObject()
  values!: Record<string, string>;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
