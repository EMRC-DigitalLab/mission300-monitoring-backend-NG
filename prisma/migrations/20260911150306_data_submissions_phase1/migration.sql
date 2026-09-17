-- CreateEnum
CREATE TYPE "DatasetFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA');

-- AlterTable
ALTER TABLE "pillars" ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "obligationId" TEXT,
ADD COLUMN     "sourceReference" TEXT;

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "requiredDataPoints" TEXT[],
    "frequency" TEXT NOT NULL,
    "ownerInstitutionId" TEXT,
    "templateFileName" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_fields" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "DatasetFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "kpiDefinitionId" TEXT,

    CONSTRAINT "dataset_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "reportingPeriod" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "focalPersonId" TEXT,
    "acceptedSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "datasets_pillarId_idx" ON "datasets"("pillarId");

-- CreateIndex
CREATE INDEX "dataset_fields_datasetId_idx" ON "dataset_fields"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "obligations_acceptedSubmissionId_key" ON "obligations"("acceptedSubmissionId");

-- CreateIndex
CREATE INDEX "obligations_institutionId_idx" ON "obligations"("institutionId");

-- CreateIndex
CREATE INDEX "obligations_datasetId_idx" ON "obligations"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "obligations_institutionId_datasetId_reportingPeriod_key" ON "obligations"("institutionId", "datasetId", "reportingPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "pillars_slug_key" ON "pillars"("slug");

-- CreateIndex
CREATE INDEX "submissions_obligationId_idx" ON "submissions"("obligationId");

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_ownerInstitutionId_fkey" FOREIGN KEY ("ownerInstitutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_fields" ADD CONSTRAINT "dataset_fields_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_fields" ADD CONSTRAINT "dataset_fields_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_focalPersonId_fkey" FOREIGN KEY ("focalPersonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_acceptedSubmissionId_fkey" FOREIGN KEY ("acceptedSubmissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

