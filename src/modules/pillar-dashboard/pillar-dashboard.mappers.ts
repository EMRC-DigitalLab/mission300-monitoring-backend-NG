import type { toKpiProfile } from "@/modules/kpi-explorer/kpi-explorer.mappers";

/**
 * A pillar dashboard has no entities of its own (docs/database-structure.md
 * in the real frontend repo) - it's a filtered view over data that already
 * exists: headline cards are real KPI Explorer profiles selected for this
 * pillar, and the delivery/bottleneck panel is Programme/Project/Bottleneck
 * rows filtered by the same `pillar` field they already carry. See
 * pillar-dashboard.service.ts, which reuses kpi-explorer.mappers.ts's
 * toKpiProfile/toCatalogueRow, programs.mappers.ts's
 * toProgrammeRecord/toProjectRecord, and bottlenecks.mappers.ts's
 * toBottleneckRecord directly rather than re-implementing any of them.
 */

export const PILLAR_LABELS: Record<string, string> = {
  "generation-network": "Generation & Network",
  "last-mile-access": "Last-Mile Access",
  "financially-viable-utilities": "Financially Viable Utilities",
  "private-sector-participation": "Private-Sector Participation",
  "regional-integration": "Regional Integration",
  "clean-cooking": "Clean Cooking",
};

/**
 * The four real KPI Matrix indicators used as each pillar's headline cards -
 * matches the frontend mock's own PILLAR_KPI_IDS constant in spirit (a
 * fixed, curated 4-KPI selection per pillar), using this backend's own real
 * seeded KPI codes rather than Nigeria's specific M300-Pxx-xxx ids.
 */
export const PILLAR_HEADLINE_KPI_CODES: Record<string, readonly [string, string, string, string]> = {
  "generation-network": [
    "generation-capacity-available",
    "renewable-share",
    "transmission-wheeling-capacity",
    "grid-reliability-index",
  ],
  "last-mile-access": [
    "access-rate-national",
    "grid-connections",
    "mini-grid-connections",
    "solar-home-systems",
  ],
  "financially-viable-utilities": ["metering-rate", "atcc-losses", "market-remittance", "tariff-shortfall"],
  "private-sector-participation": [
    "private-capital",
    "ppp-projects-financially-closed",
    "private-sector-jobs-created",
    "investment-facilitation-index",
  ],
  "regional-integration": [
    "cross-border-trade-volume",
    "regional-interconnection-capacity",
    "wapp-technical-compliance-rate",
    "regional-market-participation-milestones",
  ],
  "clean-cooking": [
    "clean-cooking-access",
    "improved-cookstoves-distributed",
    "lpg-cylinder-penetration-rate",
    "clean-cooking-institutions-engaged",
  ],
};

export const PILLAR_SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type KpiProfile = ReturnType<typeof toKpiProfile>;

/** Matches pillarHeadlineCardSchema exactly. */
export function toPillarHeadlineCard(profile: KpiProfile) {
  return {
    kpiId: profile.id,
    title: profile.name,
    value: profile.currentLabel,
    rawValue: profile.current,
    baseline: profile.baseline,
    baselineLabel: profile.baselineLabel,
    targetLabel: profile.targetLabel,
    target: profile.target,
    targetBasis: profile.targetBasis,
    targetBasisLabel: profile.targetBasisLabel,
    validationStatus: profile.validationStatus,
    provenance: profile.provenance,
  };
}

/** Matches pillarCoreIndicatorSchema exactly - `group` is the KPI's own sourceDataset, not a curated label. */
export function toPillarCoreIndicator(profile: KpiProfile, group: string) {
  return {
    kpiId: profile.id,
    name: profile.name,
    group,
    unit: profile.unit,
    current: profile.current,
    target: profile.target,
    baseline: profile.baseline,
    baselineLabel: profile.baselineLabel,
    currentLabel: profile.currentLabel,
    targetLabel: profile.targetLabel,
    direction: profile.direction,
    history: profile.history.map((point) => point.value),
    validationStatus: profile.validationStatus,
    provenance: profile.provenance,
  };
}
