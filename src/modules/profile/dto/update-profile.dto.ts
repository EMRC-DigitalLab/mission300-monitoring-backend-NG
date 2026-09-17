import { IsOptional, IsString, MinLength } from "class-validator";

// A user editing their own account - deliberately narrower than
// InviteUserDto. Email/role/institution are excluded on purpose: email is
// the login identifier (changing it is a bigger, verification-worthy
// action, not a plain profile edit), and role/institution are assigned by
// an admin, not self-service.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Enter your name" })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Enter your designation" })
  designation?: string;
}
