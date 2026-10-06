-- An indicator that records the same measurement as a matrix indicator points at it.
ALTER TABLE "kpi_definitions" ADD COLUMN "canonicalKpiId" TEXT;

CREATE INDEX "kpi_definitions_canonicalKpiId_idx" ON "kpi_definitions"("canonicalKpiId");

ALTER TABLE "kpi_definitions"
  ADD CONSTRAINT "kpi_definitions_canonicalKpiId_fkey"
  FOREIGN KEY ("canonicalKpiId") REFERENCES "kpi_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
