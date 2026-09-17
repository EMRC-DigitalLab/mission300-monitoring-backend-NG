
-- CreateEnum
CREATE TYPE "RegisterSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "BottleneckStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('NOT_ESCALATED', 'ESCALATED', 'OVERDUE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('PROGRAMME_MANAGEMENT', 'INSTITUTION_LEADERSHIP', 'STEERING_COMMITTEE', 'MINISTERIAL');

-- CreateTable
CREATE TABLE "bottlenecks" (
    "id" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "category" "BottleneckCategory" NOT NULL,
    "severity" "RegisterSeverity" NOT NULL,
    "pillarId" TEXT NOT NULL,
    "linkedRecord" TEXT NOT NULL DEFAULT '',
    "institution" TEXT NOT NULL,
    "dateRaised" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUp" TEXT NOT NULL DEFAULT '',
    "escalationStatus" "EscalationStatus" NOT NULL DEFAULT 'NOT_ESCALATED',
    "status" "BottleneckStatus" NOT NULL DEFAULT 'OPEN',
    "lifecycleStage" "LifecycleStage" NOT NULL,

    CONSTRAINT "bottlenecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottleneck_status_history" (
    "id" TEXT NOT NULL,
    "bottleneckId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "BottleneckStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bottleneck_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" TEXT NOT NULL,
    "bottleneckId" TEXT NOT NULL,
    "decisionRequired" TEXT NOT NULL,
    "level" "EscalationLevel" NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'NOT_ESCALATED',
    "resolution" TEXT,
    "evidenceUrl" TEXT,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bottlenecks_pillarId_idx" ON "bottlenecks"("pillarId");

-- CreateIndex
CREATE INDEX "bottleneck_status_history_bottleneckId_idx" ON "bottleneck_status_history"("bottleneckId");

-- CreateIndex
CREATE INDEX "escalations_bottleneckId_idx" ON "escalations"("bottleneckId");

-- AddForeignKey
ALTER TABLE "bottlenecks" ADD CONSTRAINT "bottlenecks_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottleneck_status_history" ADD CONSTRAINT "bottleneck_status_history_bottleneckId_fkey" FOREIGN KEY ("bottleneckId") REFERENCES "bottlenecks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_bottleneckId_fkey" FOREIGN KEY ("bottleneckId") REFERENCES "bottlenecks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

