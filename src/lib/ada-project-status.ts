export const ADA_PROJECT_STATUS_META = {
  under_construction: {
    color: "#f97316",
    filterKey: "plannedUnderConstruction",
    label: "Under construction",
  },
  funded_planned: {
    color: "#ec4899",
    filterKey: "plannedFunded",
    label: "Funded / planned",
  },
  design_study: {
    color: "#8b5cf6",
    filterKey: "plannedDesignStudy",
    label: "Design / study",
  },
  planned_new_station: {
    color: "#06b6d4",
    filterKey: "plannedNewStations",
    label: "Planned new station",
  },
  upgrade_to_accessible_station: {
    color: "#2563eb",
    filterKey: "plannedAccessibleUpgrades",
    label: "Upgrade to already-accessible station",
  },
} as const;

export type AdaProjectStatus = keyof typeof ADA_PROJECT_STATUS_META;
export type AdaProjectFilterKey =
  (typeof ADA_PROJECT_STATUS_META)[AdaProjectStatus]["filterKey"];

export const ADA_PROJECT_STATUSES = Object.keys(
  ADA_PROJECT_STATUS_META,
) as AdaProjectStatus[];

export function isAdaProjectStatus(value: string): value is AdaProjectStatus {
  return value in ADA_PROJECT_STATUS_META;
}
