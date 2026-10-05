-- Resolve KPI and programme source institutions from free text onto real Institution rows.

ALTER TABLE "programmes" ADD COLUMN "leadInstitutionId" TEXT;

CREATE INDEX "programmes_leadInstitutionId_idx" ON "programmes"("leadInstitutionId");

ALTER TABLE "programmes"
  ADD CONSTRAINT "programmes_leadInstitutionId_fkey"
  FOREIGN KEY ("leadInstitutionId") REFERENCES "institutions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "kpi_source_institutions" (
    "id" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_source_institutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kpi_source_institutions_kpiDefinitionId_institutionId_key"
  ON "kpi_source_institutions"("kpiDefinitionId", "institutionId");

CREATE INDEX "kpi_source_institutions_kpiDefinitionId_idx"
  ON "kpi_source_institutions"("kpiDefinitionId");

CREATE INDEX "kpi_source_institutions_institutionId_idx"
  ON "kpi_source_institutions"("institutionId");

ALTER TABLE "kpi_source_institutions"
  ADD CONSTRAINT "kpi_source_institutions_kpiDefinitionId_fkey"
  FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kpi_source_institutions"
  ADD CONSTRAINT "kpi_source_institutions_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "institutions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
