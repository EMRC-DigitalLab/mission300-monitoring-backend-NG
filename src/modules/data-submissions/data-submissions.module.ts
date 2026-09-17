import { Module } from "@nestjs/common";
import { DataSubmissionsController } from "@/modules/data-submissions/data-submissions.controller";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";
import { AdministrationModule } from "@/modules/administration/administration.module";

@Module({
  imports: [AdministrationModule],
  controllers: [DataSubmissionsController],
  providers: [DataSubmissionsService],
})
export class DataSubmissionsModule {}
