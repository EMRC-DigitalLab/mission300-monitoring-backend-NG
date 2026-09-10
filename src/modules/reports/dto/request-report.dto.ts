import { IsEnum, IsObject, IsString } from "class-validator";
import { ReportFormat } from "@prisma/client";

export class RequestReportDto {
  @IsString()
  type!: string;

  @IsEnum(ReportFormat)
  format!: ReportFormat;

  @IsObject()
  filters!: Record<string, unknown>;
}
