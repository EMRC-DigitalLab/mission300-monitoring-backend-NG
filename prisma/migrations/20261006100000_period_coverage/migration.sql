-- Months actually covered when a reporting period is incomplete in the source.
ALTER TABLE "kpi_values" ADD COLUMN "coverageNote" TEXT;
ALTER TABLE "disco_performance_records" ADD COLUMN "coverageNote" TEXT;
