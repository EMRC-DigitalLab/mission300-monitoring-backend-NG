
-- CreateEnum
CREATE TYPE "LearningLogArea" AS ENUM ('KPI_METHODOLOGY', 'DATA_GOVERNANCE', 'RESULTS_FRAMEWORK', 'SUBMISSION_WORKFLOW', 'OTHER');

-- CreateEnum
CREATE TYPE "LearningLogStatus" AS ENUM ('PROPOSED', 'DECIDED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "learning_log_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" "LearningLogArea" NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "relatedRecord" TEXT,
    "reviewCycle" TEXT NOT NULL,
    "status" "LearningLogStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_log_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "learning_log_entries" ADD CONSTRAINT "learning_log_entries_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

