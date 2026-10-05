import { IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class AssignFocalPersonDto {
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  userId!: string | null;
}
