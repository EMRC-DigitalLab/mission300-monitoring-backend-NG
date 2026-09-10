import { IsHexColor, IsOptional, IsString, IsUrl } from "class-validator";

export class UpdateBrandingDto {
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;
}
