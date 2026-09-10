import { Module } from "@nestjs/common";
import { KpisController } from "@/modules/kpis/kpis.controller";
import { KpisService } from "@/modules/kpis/kpis.service";

@Module({
  controllers: [KpisController],
  providers: [KpisService],
})
export class KpisModule {}
