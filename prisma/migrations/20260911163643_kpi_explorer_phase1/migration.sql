-- CreateEnum
CREATE TYPE "KpiReadinessTier" AS ENUM ('CORE', 'SUPPORTING', 'FUTURE');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');

-- CreateEnum
CREATE TYPE "KpiTargetBasis" AS ENUM ('LEVEL', 'GROWTH_RATE', 'NONE');

-- AlterTable
ALTER TABLE "kpi_definitions" ADD COLUMN     "aggregation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "baseline" DECIMAL(65,30),
ADD COLUMN     "baselineLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "definition" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
ADD COLUMN     "disaggregation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "externalStandardAlignment" JSONB,
ADD COLUMN     "formula" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "frequency" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "limitations" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "readiness" "KpiReadinessTier" NOT NULL DEFAULT 'CORE',
ADD COLUMN     "sourceDataset" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceInstitution" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "target" DECIMAL(65,30),
ADD COLUMN     "targetBasis" "KpiTargetBasis",
ADD COLUMN     "targetBasisLabel" TEXT,
ADD COLUMN     "targetDate" TEXT,
ADD COLUMN     "targetLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '1';

-- CreateTable
CREATE TABLE "kpi_target_points" (
    "id" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "kpi_target_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_target_points_kpiDefinitionId_idx" ON "kpi_target_points"("kpiDefinitionId");

-- AddForeignKey
ALTER TABLE "kpi_target_points" ADD CONSTRAINT "kpi_target_points_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

