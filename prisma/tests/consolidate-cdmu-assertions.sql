DO $$ BEGIN
  IF (SELECT count(*) FROM institutions) <> 1 THEN RAISE EXCEPTION 'Duplicate institution remains'; END IF;
  IF EXISTS (SELECT 1 FROM users WHERE "institutionId" <> 'seed-institution-cdmu') THEN RAISE EXCEPTION 'User link lost'; END IF;
  IF EXISTS (SELECT 1 FROM datasets WHERE "ownerInstitutionId" <> 'seed-institution-cdmu') THEN RAISE EXCEPTION 'Dataset ownership lost'; END IF;
  IF EXISTS (SELECT 1 FROM data_custodians WHERE "institutionId" <> 'seed-institution-cdmu') THEN RAISE EXCEPTION 'Custodian link lost'; END IF;
  IF (SELECT count(*) FROM obligations) <> 2 THEN RAISE EXCEPTION 'Wrong obligation count'; END IF;
  IF (SELECT "acceptedSubmissionId" FROM obligations WHERE id = 'canonical-obligation') <> 'test-submission' THEN RAISE EXCEPTION 'Accepted submission lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM submissions WHERE id = 'test-submission' AND "institutionId" = 'seed-institution-cdmu' AND "obligationId" = 'canonical-obligation') THEN RAISE EXCEPTION 'Submission links lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM kpi_values WHERE id = 'test-value' AND "institutionId" = 'seed-institution-cdmu' AND value = 29) THEN RAISE EXCEPTION 'KPI value changed or attribution lost'; END IF;
END $$;
SELECT 'CDMU merge preserved users, ownership, custodians, obligations, submissions and KPI values' AS result;
