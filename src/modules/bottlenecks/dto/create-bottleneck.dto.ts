import { IsEnum, IsOptional, IsString } from "class-validator";
import { BottleneckSeverity } from "@prisma/client";

export class CreateBottleneckDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(BottleneckSeverity)
  severity!: BottleneckSeverity;

  @IsString()
  category!: string;
}
