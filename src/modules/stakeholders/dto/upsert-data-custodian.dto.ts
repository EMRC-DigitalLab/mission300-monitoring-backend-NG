import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateDataCustodianDto {
  @IsString()
  @MinLength(1)
  institutionId!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @MinLength(1)
  scope!: string;
}

export class UpdateDataCustodianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  scope?: string;
}
