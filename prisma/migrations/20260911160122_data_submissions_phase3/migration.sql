-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "reviewerId" TEXT;

-- CreateIndex
CREATE INDEX "submissions_reviewerId_idx" ON "submissions"("reviewerId");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

