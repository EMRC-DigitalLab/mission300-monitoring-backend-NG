-- These two indicators named a publication in the source-institution field, so no
-- institution was recorded. CDMU owns them; the publication stays in sourceReference.
UPDATE "kpi_definitions"
SET "sourceInstitution" = 'CDMU'
WHERE "code" IN ('M300-P2-010', 'M300-P2-012')
  AND "sourceInstitution" IN ('National reports', 'SDG7 Tracking Report');
