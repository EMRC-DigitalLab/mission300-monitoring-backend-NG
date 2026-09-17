import { Module } from "@nestjs/common";
import { ProfileController } from "@/modules/profile/profile.controller";
import { ProfileService } from "@/modules/profile/profile.service";

@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
