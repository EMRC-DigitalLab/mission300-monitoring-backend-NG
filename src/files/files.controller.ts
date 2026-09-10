import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApiTags, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { FilesService } from "@/files/files.service";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

@ApiTags("files")
@ApiBearerAuth()
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  // Generic upload - accepts any file type. For the structured Excel/CSV
  // submission-data upload, see the data-submissions module instead: that
  // one parses the file into SubmissionItems rather than storing it as-is.
  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @AuditAction("file.uploaded")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.files.upload(user, file);
  }

  @Get(":id")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { record, buffer } = await this.files.download(user, id);
    res.set({
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename="${record.originalName}"`,
    });
    return new StreamableFile(buffer);
  }
}
