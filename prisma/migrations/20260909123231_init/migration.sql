-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SYSTEM_ADMINISTRATOR', 'INSTITUTIONAL_DATA_PROVIDER', 'DATA_REVIEWER', 'VALIDATOR', 'DASHBOARD_MANAGER', 'OVERSIGHT_USER', 'READ_ONLY_USER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROVISIONALLY_APPROVED', 'RETURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionMethod" AS ENUM ('MANUAL_ENTRY', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('APPROVE', 'PROVISIONALLY_APPROVE', 'RETURN_FOR_CORRECTION', 'REJECT');

-- CreateEnum
CREATE TYPE "BottleneckSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX');

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_custodians" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,

    CONSTRAINT "data_custodians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pillars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "pillars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_values" (
    "id" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "institutionId" TEXT,
    "period" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "sourceSubmissionItemId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "method" "SubmissionMethod" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "sourceFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_items" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "validationIssues" JSONB,

    CONSTRAINT "submission_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "decision" "ReviewDecisionType" NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pillarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottlenecks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "BottleneckSeverity" NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "bottlenecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "fileUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0B5FFF',
    "secondaryColor" TEXT NOT NULL DEFAULT '#111827',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_institutionId_idx" ON "users"("institutionId");

-- CreateIndex
CREATE INDEX "data_custodians_institutionId_idx" ON "data_custodians"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "pillars_name_key" ON "pillars"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_code_key" ON "kpi_definitions"("code");

-- CreateIndex
CREATE INDEX "kpi_definitions_pillarId_idx" ON "kpi_definitions"("pillarId");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_values_sourceSubmissionItemId_key" ON "kpi_values"("sourceSubmissionItemId");

-- CreateIndex
CREATE INDEX "kpi_values_kpiDefinitionId_period_idx" ON "kpi_values"("kpiDefinitionId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_previousVersionId_key" ON "submissions"("previousVersionId");

-- CreateIndex
CREATE INDEX "submissions_institutionId_status_idx" ON "submissions"("institutionId", "status");

-- CreateIndex
CREATE INDEX "submission_items_submissionId_idx" ON "submission_items"("submissionId");

-- CreateIndex
CREATE INDEX "review_decisions_submissionId_idx" ON "review_decisions"("submissionId");

-- CreateIndex
CREATE INDEX "projects_programId_idx" ON "projects"("programId");

-- CreateIndex
CREATE INDEX "bottlenecks_projectId_idx" ON "bottlenecks"("projectId");

-- CreateIndex
CREATE INDEX "reports_requestedById_idx" ON "reports"("requestedById");

-- CreateIndex
CREATE INDEX "audit_log_entries_entityType_entityId_idx" ON "audit_log_entries"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_entries_actorId_idx" ON "audit_log_entries"("actorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_custodians" ADD CONSTRAINT "data_custodians_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_sourceSubmissionItemId_fkey" FOREIGN KEY ("sourceSubmissionItemId") REFERENCES "submission_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_items" ADD CONSTRAINT "submission_items_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_items" ADD CONSTRAINT "submission_items_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottlenecks" ADD CONSTRAINT "bottlenecks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
