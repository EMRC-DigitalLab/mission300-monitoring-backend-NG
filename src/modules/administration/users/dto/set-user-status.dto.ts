import { IsEnum } from "class-validator";
import { AccountStatus } from "@prisma/client";

export class SetUserStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}
