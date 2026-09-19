// The exact marker distinguishing a KpiExplorerService.setCurrentValue()
// admin override from every other obligationId-less Submission in this
// database - notably the historical bulk-import scripts (ingest-nerc-genco-
// kpis.ts, ingest-national-rollup-kpis.ts) ALSO create synthetic
// submissions with no obligationId, purely to satisfy KpiValue's required
// FK chain. Checking obligationId alone would make that real historical
// data look like an editable/deletable admin override too - this string is
// what actually tells the two apart. Shared between kpi-explorer.service.ts
// (which stamps it) and kpi-explorer.mappers.ts (which reads it back) to
// avoid a circular import between the two.
export const ADMIN_OVERRIDE_SOURCE_REFERENCE = "Admin override — set directly, outside the submission workflow.";
