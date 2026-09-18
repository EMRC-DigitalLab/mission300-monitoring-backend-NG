import { Module } from "@nestjs/common";
import { StateDiscoController } from "@/modules/state-disco/state-disco.controller";
import { StateDiscoService } from "@/modules/state-disco/state-disco.service";

@Module({
  controllers: [StateDiscoController],
  providers: [StateDiscoService],
  exports: [StateDiscoService],
})
export class StateDiscoModule {}
