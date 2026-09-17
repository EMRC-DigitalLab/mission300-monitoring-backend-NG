
-- CreateEnum
CREATE TYPE "ServiceBand" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "stateId" TEXT;

-- CreateTable
CREATE TABLE "states" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disco_performance_records" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "activeCustomers" INTEGER NOT NULL,
    "meteredCustomers" INTEGER NOT NULL,
    "energyReceivedMwh" DECIMAL(65,30) NOT NULL,
    "energyBilledMwh" DECIMAL(65,30) NOT NULL,
    "revenueBilledNgn" DECIMAL(65,30) NOT NULL,
    "revenueCollectedNgn" DECIMAL(65,30) NOT NULL,
    "remittanceObligationNgn" DECIMAL(65,30) NOT NULL,
    "remittanceActualNgn" DECIMAL(65,30) NOT NULL,
    "allowedLossRatePercent" DECIMAL(65,30) NOT NULL,
    "atccLossRatePercent" DECIMAL(65,30) NOT NULL,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disco_performance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disco_service_bands" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "band" "ServiceBand" NOT NULL,
    "effectiveOrder" TEXT NOT NULL,
    "supplyHoursPerDay" DECIMAL(65,30) NOT NULL,
    "tariffNgnPerKwh" DECIMAL(65,30) NOT NULL,
    "intensityPercent" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disco_service_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disco_delivery_milestones" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "serviceBand" "ServiceBand" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "executionStatus" "ExecutionStatus" NOT NULL DEFAULT 'ON_TRACK',
    "achievedDate" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "reportingCompliance" TEXT NOT NULL DEFAULT '',
    "bottleneck" TEXT NOT NULL DEFAULT '',
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disco_delivery_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE INDEX "disco_performance_records_institutionId_idx" ON "disco_performance_records"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "disco_performance_records_institutionId_period_key" ON "disco_performance_records"("institutionId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "disco_service_bands_institutionId_band_key" ON "disco_service_bands"("institutionId", "band");

-- CreateIndex
CREATE INDEX "disco_delivery_milestones_institutionId_idx" ON "disco_delivery_milestones"("institutionId");

-- CreateIndex
CREATE INDEX "projects_stateId_idx" ON "projects"("stateId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disco_performance_records" ADD CONSTRAINT "disco_performance_records_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disco_service_bands" ADD CONSTRAINT "disco_service_bands_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disco_delivery_milestones" ADD CONSTRAINT "disco_delivery_milestones_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

