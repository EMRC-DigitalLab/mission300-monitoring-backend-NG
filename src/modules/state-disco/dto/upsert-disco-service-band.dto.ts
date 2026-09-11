import { Transform } from "class-transformer";
import { IsEnum, IsNumber, IsString, Max, Min, MinLength } from "class-validator";
import { ServiceBand } from "@prisma/client";

// No real frontend contract dictates this shape (same reasoning as
// UpsertDiscoPerformanceDto) - this backend's own admin-entry surface for
// approved supply-hours/tariff-by-band data.
export class UpsertDiscoServiceBandDto {
  @Transform(({ value }) => (typeof value === "string" ? value.toUpperCase() : value))
  @IsEnum(ServiceBand)
  band!: ServiceBand;

  @IsString()
  @MinLength(1, { message: "Name the approved tariff order, e.g. MYTO 2024 Minor Review" })
  effectiveOrder!: string;

  @IsNumber()
  @Min(0)
  @Max(24)
  supplyHoursPerDay!: number;

  @IsNumber()
  @Min(0)
  tariffNgnPerKwh!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  intensityPercent!: number;
}
