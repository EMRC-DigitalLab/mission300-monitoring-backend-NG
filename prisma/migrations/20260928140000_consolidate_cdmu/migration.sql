-- The CPR imports use this stable id. Keep it so future imports cannot
-- recreate CDMU alongside a manually-created abbreviation.
BEGIN;
DO $$
DECLARE
  duplicate RECORD;
  obligation RECORD;
  target_obligation TEXT;
  reference RECORD;
  canonical CONSTANT TEXT := 'seed-institution-cdmu';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM institutions WHERE id = canonical
      OR lower(trim(name)) IN ('cdmu', 'compact delivery and monitoring unit (cdmu)', 'compact delivery and monitoring unit')
  ) THEN RETURN; END IF;

  INSERT INTO institutions (id, name, type, "createdAt", "updatedAt")
  VALUES (canonical, 'Compact Delivery and Monitoring Unit (CDMU)', 'Federal Coordinating Unit', now(), now())
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now();

  FOR duplicate IN SELECT id FROM institutions WHERE id <> canonical
    AND lower(trim(name)) IN ('cdmu', 'compact delivery and monitoring unit (cdmu)', 'compact delivery and monitoring unit')
    ORDER BY "createdAt", id
  LOOP
    -- A duplicate institution may have the same reporting obligation.
    -- Move every submission before removing only the duplicate obligation.
    FOR obligation IN SELECT * FROM obligations WHERE "institutionId" = duplicate.id LOOP
      SELECT id INTO target_obligation FROM obligations
      WHERE "institutionId" = canonical AND "datasetId" = obligation."datasetId"
        AND "reportingPeriod" = obligation."reportingPeriod";
      IF target_obligation IS NOT NULL THEN
        UPDATE submissions SET "obligationId" = target_obligation WHERE "obligationId" = obligation.id;
        DELETE FROM obligations WHERE id = obligation.id;
        UPDATE obligations SET
          "acceptedSubmissionId" = COALESCE("acceptedSubmissionId", obligation."acceptedSubmissionId"),
          "focalPersonId" = COALESCE("focalPersonId", obligation."focalPersonId")
        WHERE id = target_obligation;
      ELSE
        UPDATE obligations SET "institutionId" = canonical WHERE id = obligation.id;
      END IF;
    END LOOP;

    -- Cover every actual FK to institutions, including users, custodians,
    -- dataset ownership and submissions. Conflicting unique records abort
    -- the transaction rather than discarding app data.
    FOR reference IN
      SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
      FROM pg_constraint c JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'institutions'::regclass
    LOOP
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', reference.table_name, reference.column_name, reference.column_name)
      USING canonical, duplicate.id;
    END LOOP;
    -- KPI attribution is a scalar field, without a foreign key.
    UPDATE kpi_values SET "institutionId" = canonical WHERE "institutionId" = duplicate.id;
    DELETE FROM institutions WHERE id = duplicate.id;
  END LOOP;
  UPDATE bottlenecks SET institution = 'Compact Delivery and Monitoring Unit (CDMU)'
    WHERE lower(trim(institution)) IN ('cdmu', 'compact delivery and monitoring unit');
  UPDATE scope_assignments SET scope = 'Compact Delivery and Monitoring Unit (CDMU)'
    WHERE level = 'INSTITUTION' AND lower(trim(scope)) IN ('cdmu', 'compact delivery and monitoring unit');
END $$;
COMMIT;
