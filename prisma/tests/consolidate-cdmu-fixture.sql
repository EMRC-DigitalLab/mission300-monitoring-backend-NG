-- Run only in an empty disposable database with the application schema.
INSERT INTO institutions (id, name, type, "updatedAt") VALUES
 ('seed-institution-cdmu', 'Compact Delivery and Monitoring Unit (CDMU)', 'Federal Coordinating Unit', now()),
 ('old-cdmu', 'CDMU', 'Federal Agency', now());
INSERT INTO users (id, email, "passwordHash", "fullName", role, "institutionId", "updatedAt")
 VALUES ('test-user', 'fixture@example.com', 'unused', 'Fixture', 'SYSTEM_ADMINISTRATOR', 'old-cdmu', now());
INSERT INTO pillars (id, name, slug) VALUES ('test-pillar', 'Fixture pillar', 'test-pillar');
INSERT INTO datasets (id, name, purpose, "pillarId", "requiredDataPoints", frequency, "ownerInstitutionId", "templateFileName", "updatedAt")
 VALUES ('test-dataset', 'Fixture', 'Fixture', 'test-pillar', '{}', 'Annual', 'old-cdmu', 'fixture.xlsx', now());
INSERT INTO obligations (id, "institutionId", "datasetId", "reportingPeriod", "dueDate", "updatedAt") VALUES
 ('canonical-obligation', 'seed-institution-cdmu', 'test-dataset', '2026', now(), now()),
 ('duplicate-obligation', 'old-cdmu', 'test-dataset', '2026', now(), now()),
 ('unique-obligation', 'old-cdmu', 'test-dataset', '2027', now(), now());
INSERT INTO submissions (id, "institutionId", "submittedById", method, status, "obligationId", "updatedAt")
 VALUES ('test-submission', 'old-cdmu', 'test-user', 'MANUAL_ENTRY', 'APPROVED', 'duplicate-obligation', now());
UPDATE obligations SET "acceptedSubmissionId" = 'test-submission' WHERE id = 'duplicate-obligation';
INSERT INTO data_custodians (id, "institutionId", "contactName", "contactEmail", scope)
 VALUES ('test-custodian', 'old-cdmu', 'Fixture', 'fixture@example.com', 'Test');
INSERT INTO kpi_definitions (id, code, name, unit, "pillarId", "updatedAt")
 VALUES ('test-kpi', 'TEST', 'Fixture KPI', '%', 'test-pillar', now());
INSERT INTO submission_items (id, "submissionId", "kpiDefinitionId", period, value)
 VALUES ('test-item', 'test-submission', 'test-kpi', '2026', 29);
INSERT INTO kpi_values (id, "kpiDefinitionId", "institutionId", period, value, "sourceSubmissionItemId", "approvedAt")
 VALUES ('test-value', 'test-kpi', 'old-cdmu', '2026', 29, 'test-item', now());
