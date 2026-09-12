import { Module } from "@nestjs/common";
import { LearningLogController } from "@/modules/learning-log/learning-log.controller";
import { LearningLogService } from "@/modules/learning-log/learning-log.service";

@Module({
  controllers: [LearningLogController],
  providers: [LearningLogService],
})
export class LearningLogModule {}
