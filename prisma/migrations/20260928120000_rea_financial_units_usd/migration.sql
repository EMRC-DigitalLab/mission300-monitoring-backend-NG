-- Currency confirmed as USD for the REA financial snapshot. These are
-- dollar amounts, not USD millions; preserve every recorded numeric value.
BEGIN;

UPDATE "kpi_definitions"
SET "unit" = 'USD'
WHERE "code" IN (
  'M300-P4-011', 'M300-P4-012',
  'M300-PX-008', 'M300-PX-009', 'M300-PX-010',
  'M300-PX-011', 'M300-PX-012', 'M300-PX-013'
)
AND "unit" = 'Currency not stated';

UPDATE "dataset_fields" AS field
SET "unit" = 'USD'
FROM "kpi_definitions" AS kpi
WHERE field."kpiDefinitionId" = kpi."id"
AND kpi."code" IN (
  'M300-P4-011', 'M300-P4-012',
  'M300-PX-008', 'M300-PX-009', 'M300-PX-010',
  'M300-PX-011', 'M300-PX-012', 'M300-PX-013'
)
AND field."unit" = 'Currency not stated';

COMMIT;
