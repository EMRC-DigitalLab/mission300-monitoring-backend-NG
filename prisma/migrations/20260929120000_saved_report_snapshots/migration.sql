ALTER TABLE "saved_reports" ADD COLUMN "previewSnapshot" JSONB;
ALTER TABLE "saved_reports" ADD COLUMN "orientation" TEXT NOT NULL DEFAULT 'portrait';
