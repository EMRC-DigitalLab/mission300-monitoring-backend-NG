import { Module } from "@nestjs/common";
import { BottlenecksController } from "@/modules/bottlenecks/bottlenecks.controller";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";

@Module({
  controllers: [BottlenecksController],
  providers: [BottlenecksService],
})
export class BottlenecksModule {}
