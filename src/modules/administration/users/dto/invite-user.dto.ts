import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { RoleName } from "@prisma/client";

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  fullName!: string;

  @IsEnum(RoleName)
  role!: RoleName;

  @IsOptional()
  @IsString()
  institutionId?: string;
}
