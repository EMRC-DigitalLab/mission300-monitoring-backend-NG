import { Module } from "@nestjs/common";
import { FilesController } from "@/files/files.controller";
import { FilesService } from "@/files/files.service";

@Module({
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
