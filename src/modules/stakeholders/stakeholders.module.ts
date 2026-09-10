import { Module } from "@nestjs/common";
import { StakeholdersController } from "@/modules/stakeholders/stakeholders.controller";
import { StakeholdersService } from "@/modules/stakeholders/stakeholders.service";

@Module({
  controllers: [StakeholdersController],
  providers: [StakeholdersService],
})
export class StakeholdersModule {}
