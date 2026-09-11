
-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('COMPACT_PROGRESS', 'COMPACT_REVIEW', 'PILLAR_PERFORMANCE', 'KPI_INDICATOR', 'STATE_DISCO', 'IMPLEMENTATION', 'BOTTLENECK', 'FINANCIAL', 'SUBMISSION_COMPLIANCE', 'DATA_QUALITY');

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_requestedById_fkey";

-- DropTable
DROP TABLE "reports";

-- DropEnum
DROP TYPE "ReportStatus";

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "filtersSummary" TEXT NOT NULL,
    "validationStatusLabel" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "format" "ReportFormat" NOT NULL,
    "fileReference" TEXT NOT NULL,
    "configSignature" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastGeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_reports_requestedById_idx" ON "saved_reports"("requestedById");

-- CreateIndex
CREATE INDEX "saved_reports_configSignature_idx" ON "saved_reports"("configSignature");

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

