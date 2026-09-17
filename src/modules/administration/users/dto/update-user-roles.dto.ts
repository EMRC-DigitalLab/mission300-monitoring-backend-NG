import { Transform } from "class-transformer";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum } from "class-validator";
import { RoleName } from "@prisma/client";
import { parseKebabEnum } from "@/common/utils/enum-casing";

export class UpdateUserRolesDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((role) => typeof role === "string" ? parseKebabEnum(role, Object.values(RoleName), "roles") : role)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(RoleName, { each: true })
  roles!: RoleName[];
}
