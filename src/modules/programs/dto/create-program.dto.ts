import { IsOptional, IsString } from "class-validator";

export class CreateProgramDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  pillarId?: string;
}
