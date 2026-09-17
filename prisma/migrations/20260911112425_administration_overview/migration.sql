-- CreateEnum
CREATE TYPE "ScopeLevel" AS ENUM ('NATIONAL', 'STATE', 'DISTRIBUTION_COMPANY', 'INSTITUTION', 'PROGRAMME', 'PROJECT', 'DATASET', 'INDICATOR');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'REJECTED');

-- AlterTable
ALTER TABLE "audit_log_entries" ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "designation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastLogin" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "scope_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "ScopeLevel" NOT NULL,
    "scope" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "scope_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scope_assignments_userId_idx" ON "scope_assignments"("userId");

-- AddForeignKey
ALTER TABLE "scope_assignments" ADD CONSTRAINT "scope_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
