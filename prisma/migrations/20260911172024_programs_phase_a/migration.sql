
-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RegisterPriority" AS ENUM ('PRIORITY', 'STANDARD');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('CONFIRMED', 'PUBLIC_SOURCE', 'REQUIRES_VALIDATION', 'PROVISIONAL', 'FUTURE');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('GRANT', 'CONCESSIONAL_LOAN', 'PPP', 'GOVERNMENT_FUNDED', 'BLENDED_FINANCE');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('COMMITTED', 'DISBURSING', 'FULLY_DISBURSED', 'AT_RISK', 'UNFUNDED');

-- CreateEnum
CREATE TYPE "PipelineReadiness" AS ENUM ('PIPELINE', 'FEASIBILITY_STUDY', 'INVESTMENT_READY');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('IDENTIFICATION', 'DESIGN', 'PROCUREMENT', 'IMPLEMENTATION', 'COMMISSIONING', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "BottleneckCategory" AS ENUM ('FINANCING', 'PROCUREMENT', 'PERMITTING', 'REGULATORY_APPROVAL', 'COORDINATION', 'TECHNICAL_CONSTRAINT', 'IMPLEMENTATION_DELAY', 'DATA_OR_REPORTING');

-- DropForeignKey
ALTER TABLE "bottlenecks" DROP CONSTRAINT "bottlenecks_projectId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_programId_fkey";

-- DropIndex
DROP INDEX "projects_programId_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "programId",
DROP COLUMN "status",
ADD COLUMN     "bottleneckCategory" "BottleneckCategory",
ADD COLUMN     "budgetUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "comment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contractor" TEXT,
ADD COLUMN     "coverage" TEXT NOT NULL,
ADD COLUMN     "currentStatus" "ExecutionStatus" NOT NULL DEFAULT 'ON_TRACK',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disbursedUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "fundingSource" TEXT,
ADD COLUMN     "fundingStatus" "FundingStatus" NOT NULL DEFAULT 'UNFUNDED',
ADD COLUMN     "fundingStructure" TEXT NOT NULL DEFAULT 'To be confirmed',
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "leadName" TEXT NOT NULL,
ADD COLUMN     "lifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'IDENTIFICATION',
ADD COLUMN     "location" TEXT NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "pillarId" TEXT NOT NULL,
ADD COLUMN     "pipelineReadiness" "PipelineReadiness",
ADD COLUMN     "programType" "ProgramType" NOT NULL DEFAULT 'GOVERNMENT_FUNDED',
ADD COLUMN     "programmeId" TEXT NOT NULL,
ADD COLUMN     "projectedStatus" "ExecutionStatus" NOT NULL DEFAULT 'ON_TRACK',
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "suggestion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PROVISIONAL';

-- DropTable
DROP TABLE "bottlenecks";

-- DropTable
DROP TABLE "programs";

-- DropEnum
DROP TYPE "BottleneckSeverity";

-- CreateTable
CREATE TABLE "programmes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadInstitution" TEXT NOT NULL,
    "supportingInstitutions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pillarId" TEXT NOT NULL,
    "objectives" TEXT NOT NULL,
    "financing" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'ON_TRACK',
    "priority" "RegisterPriority" NOT NULL DEFAULT 'STANDARD',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "bottleneckCategory" "BottleneckCategory",
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_status_history" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_updates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "RegisterPriority" NOT NULL DEFAULT 'STANDARD',
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "status" "ExecutionStatus" NOT NULL DEFAULT 'ON_TRACK',
    "leadInstitution" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "risk" TEXT NOT NULL DEFAULT '',
    "nextAction" TEXT NOT NULL DEFAULT '',
    "bottleneckCategory" "BottleneckCategory",
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programmes_pillarId_idx" ON "programmes"("pillarId");

-- CreateIndex
CREATE INDEX "project_status_history_projectId_idx" ON "project_status_history"("projectId");

-- CreateIndex
CREATE INDEX "project_documents_projectId_idx" ON "project_documents"("projectId");

-- CreateIndex
CREATE INDEX "project_updates_projectId_idx" ON "project_updates"("projectId");

-- CreateIndex
CREATE INDEX "milestones_projectId_idx" ON "milestones"("projectId");

-- CreateIndex
CREATE INDEX "projects_programmeId_idx" ON "projects"("programmeId");

-- CreateIndex
CREATE INDEX "projects_pillarId_idx" ON "projects"("pillarId");

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

