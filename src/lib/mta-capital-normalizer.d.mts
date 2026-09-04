import type {
  CapitalProject,
  CapitalProjectDataset,
  CapitalProjectMetadata,
  CapitalProjectSummary,
  RawCapitalSourceBundle,
} from "./mta-capital-types";

export function buildCapitalProjectDataset(
  bundle: RawCapitalSourceBundle,
  pageSourceMode?: CapitalProjectMetadata["pageSourceMode"],
): CapitalProjectDataset;

export function getCapitalProjectSummaries(
  projects: CapitalProject[],
): CapitalProjectSummary[];

export function isElevatorEscalatorProject(
  row: Record<string, unknown>,
): boolean;
