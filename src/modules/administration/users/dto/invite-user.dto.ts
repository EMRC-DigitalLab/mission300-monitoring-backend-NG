import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { RoleName, ScopeLevel } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

// Matches inviteUserRequestSchema exactly (m300-frontend/src/api/schemas/
// administration.ts) - note "name" (not fullName), "institution" as a
// free-text name (not institutionId), and the added "designation"/
// "accessScope"/"invitationMessage" fields the old DTO never had.
export class InviteUserDto {
  @IsString()
  @MinLength(2, { message: "Enter the user name" })
  name!: string;

  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @IsString()
  @MinLength(1, { message: "Select an institution" })
  institution!: string;

  @IsString()
  @MinLength(2, { message: "Enter the designation" })
  designation!: string;

  // Role/accessScope arrive as lower-kebab-case (systemRoleSchema/
  // scopeLevelSchema) - transformed to the Prisma enum's own casing before
  // validation, same pattern used for query params in overview.service.ts.
  // @IsEnum is required here too, not just @Transform: with
  // whitelist/forbidNonWhitelisted (see main.ts), class-validator only
  // recognizes a property as "known" if it has its own validator
  // decorator - @Transform alone left these two silently stripped and
  // then rejected as unknown properties.
  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(RoleName), "role") : value,
  )
  @IsEnum(RoleName)
  role!: RoleName;

  @Transform(({ value }) =>
    typeof value === "string" ? parseKebabEnum(value, Object.values(ScopeLevel), "accessScope") : value,
  )
  @IsEnum(ScopeLevel)
  accessScope!: ScopeLevel;

  // Accepted for contract parity - not currently acted on (no email template
  // includes it, no field stores it), same as the mock, which also accepts
  // and ignores it.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invitationMessage?: string;
}
