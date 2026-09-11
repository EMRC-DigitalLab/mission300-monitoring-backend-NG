import { IsNotEmpty, IsString, Matches } from "class-validator";

// Matches the frontend's own hexColorSchema exactly (6-digit hex, leading
// #) so a rejected value produces the same message shape it would from the
// mock backend - class-validator's built-in @IsHexColor() is looser (also
// accepts 3/8-digit forms), which the frontend never sends or expects.
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_MESSAGE = "Must be a 6-digit hex colour, e.g. #008751";

export class UpdateBrandColorsDto {
  @IsString()
  @IsNotEmpty()
  countryName!: string;

  @Matches(HEX_COLOR_PATTERN, { message: HEX_COLOR_MESSAGE })
  primaryColor!: string;

  @Matches(HEX_COLOR_PATTERN, { message: HEX_COLOR_MESSAGE })
  secondaryColor!: string;

  @Matches(HEX_COLOR_PATTERN, { message: HEX_COLOR_MESSAGE })
  textColor!: string;

  @Matches(HEX_COLOR_PATTERN, { message: HEX_COLOR_MESSAGE })
  sidebarColor!: string;
}
