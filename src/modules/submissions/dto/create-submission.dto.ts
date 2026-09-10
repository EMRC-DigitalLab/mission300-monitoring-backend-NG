import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsString, ValidateNested } from "class-validator";
import { SubmissionMethod } from "@prisma/client";

export class SubmissionItemDto {
  @IsString()
  kpiDefinitionId!: string;

  @IsString()
  period!: string;

  @IsNumber()
  value!: number;
}

export class CreateSubmissionDto {
  @IsEnum(SubmissionMethod)
  method!: SubmissionMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmissionItemDto)
  items!: SubmissionItemDto[];
}
