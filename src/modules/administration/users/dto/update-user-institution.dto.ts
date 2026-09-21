import { IsString, MinLength } from "class-validator";

export class UpdateUserInstitutionDto {
  @IsString()
  @MinLength(1)
  institution!: string;
}
