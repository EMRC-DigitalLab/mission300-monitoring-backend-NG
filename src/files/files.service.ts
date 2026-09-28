import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { StorageService } from "@/storage/storage.service";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { validateUpload } from "./upload-validation";

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(user: AuthenticatedUser, file: Express.Multer.File | undefined) {
    const verified = await validateUpload(file);
    const stored = await this.storage.save("uploads", verified);

    return this.prisma.uploadedFile.create({
      data: {
        uploadedById: user.id,
        storageKey: stored.key,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
      },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!record) throw new NotFoundException("File not found");
    if (record.uploadedById !== user.id && user.role !== "SYSTEM_ADMINISTRATOR") {
      throw new ForbiddenException("You cannot access another user's file");
    }
    return record;
  }

  async download(user: AuthenticatedUser, id: string) {
    const record = await this.findOne(user, id);
    const buffer = await this.storage.read(record.storageKey);
    return { record, buffer };
  }
}
