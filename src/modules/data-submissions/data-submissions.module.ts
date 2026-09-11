import { Module } from "@nestjs/common";
import { DataSubmissionsController } from "@/modules/data-submissions/data-submissions.controller";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";

@Module({
  controllers: [DataSubmissionsController],
  providers: [DataSubmissionsService],
})
export class DataSubmissionsModule {}
