import { Global, Module } from "@nestjs/common";
import { RabbitmqService } from "@/events/rabbitmq.service";

@Global()
@Module({
  providers: [RabbitmqService],
  exports: [RabbitmqService],
})
export class RabbitmqModule {}
