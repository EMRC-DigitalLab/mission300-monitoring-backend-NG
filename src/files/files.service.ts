import { extname } from "node:path";
import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { StorageService } from "@/storage/storage.service";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

// Generic-upload allowlist - images, PDFs and common office/spreadsheet
// formats, matching the kind of evidence/document attachments this endpoint
// is actually for. Neither list alone is trustworthy (extension and
// mimetype are both client-supplied), so both must match - see WEB-011 in
// the audit report. The structured Excel/CSV submission-data path in the
// data-submissions module has its own separate, schema-driven validation
// and isn't affected by this.
const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".pdf",
  ".doc", ".docx", ".xls", ".xlsx", ".csv",
]);
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(user: AuthenticatedUser, file: Express.Multer.File) {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Unsupported file type. Allowed: images, PDF, Word, Excel, CSV.",
      );
    }

    const stored = await this.storage.save("uploads", file);

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
