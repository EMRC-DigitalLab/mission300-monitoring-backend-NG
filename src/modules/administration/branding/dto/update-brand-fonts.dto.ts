import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { BrandFontsDto } from "@/modules/administration/branding/dto/brand-fonts.dto";

export class UpdateBrandFontsDto {
  @ValidateNested()
  @Type(() => BrandFontsDto)
  fonts!: BrandFontsDto;
}
