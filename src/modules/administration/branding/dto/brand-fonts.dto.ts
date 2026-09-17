import { IsNotEmpty, IsString } from "class-validator";

/** One Google Fonts family name per heading level plus body text. */
export class BrandFontsDto {
  @IsString()
  @IsNotEmpty()
  h1!: string;

  @IsString()
  @IsNotEmpty()
  h2!: string;

  @IsString()
  @IsNotEmpty()
  h3!: string;

  @IsString()
  @IsNotEmpty()
  h4!: string;

  @IsString()
  @IsNotEmpty()
  h5!: string;

  @IsString()
  @IsNotEmpty()
  h6!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
