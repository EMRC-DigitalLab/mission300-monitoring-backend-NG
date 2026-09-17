import { Module } from "@nestjs/common";
import { SubmissionsController } from "@/modules/submissions/submissions.controller";
import { SubmissionsService } from "@/modules/submissions/submissions.service";
import { AdministrationModule } from "@/modules/administration/administration.module";

@Module({
  imports: [AdministrationModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
