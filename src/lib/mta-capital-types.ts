export type CapitalProjectSource = "modern" | "legacy";

export type CapitalBudgetLine = {
  acep: string;
  annotations: string | null;
  baselineBudget: number | null;
  currentBudget: number | null;
  expenditures: number | null;
};

export type CapitalBudgetSnapshot = {
  baselineBudget: number | null;
  currentBudget: number | null;
  date: string;
  expenditures: number | null;
  lines: CapitalBudgetLine[];
};

export type CapitalAllocation = {
  amount: number;
  label: string;
};

export type CapitalBudgetRevision = {
  allocations: CapitalAllocation[];
  changeNarrative: string | null;
  revision: string;
  submissionLabel: string;
  totalAllocation: number | null;
};

export type CapitalMilestone = {
  date: string | null;
  description: string | null;
  flagged: boolean;
  title: string;
};

export type CapitalPhase = {
  endDate: string | null;
  milestones: CapitalMilestone[];
  name: string;
  sequence: number | null;
  startDate: string | null;
  state: string | null;
};

export type CapitalProject = {
  agencies: string[];
  assetCategories: string[];
  baselineCompletionDate: string | null;
  budgetDeltaPercent: number | null;
  budgetHistory: CapitalBudgetSnapshot[];
  budgetRevisions: CapitalBudgetRevision[];
  budgetStatus: string | null;
  capitalPlans: string[];
  contractNumber: string | null;
  contractType: string | null;
  currentBudget: number | null;
  description: string;
  estimatedCompletionDate: string | null;
  expenditures: number | null;
  externalId: string;
  initiatives: string[];
  key: string;
  needsCode: string | null;
  originalBudget: number | null;
  percentComplete: number | null;
  phase: string | null;
  phases: CapitalPhase[];
  primeContractor: string | null;
  scheduleStatus: string | null;
  services: string[];
  slug: string;
  source: CapitalProjectSource;
  sourceRecordAsOf: string | null;
  sourceUrl: string;
  stage: string | null;
  startDate: string | null;
  title: string;
};

export type CapitalProjectSummary = Pick<
  CapitalProject,
  | "agencies"
  | "assetCategories"
  | "budgetDeltaPercent"
  | "currentBudget"
  | "estimatedCompletionDate"
  | "externalId"
  | "percentComplete"
  | "phase"
  | "slug"
  | "source"
  | "sourceRecordAsOf"
  | "stage"
  | "title"
>;

export type CapitalSourceCounts = {
  legacyBudgetDetails: number;
  legacySummaryHistory: number;
  modernBudgets: number;
  modernDetails: number;
  modernSchedules: number;
};

export type CapitalProjectMetadata = {
  checkedAt: string;
  legacyProjectCount: number;
  modernProjectCount: number;
  pageSourceMode: "database" | "live_api" | "local_snapshot";
  projectCount: number;
  sourceCounts: CapitalSourceCounts;
};

export type CapitalProjectDataset = {
  metadata: CapitalProjectMetadata;
  projects: CapitalProject[];
};

export type RawCapitalSourceBundle = {
  checkedAt: string;
  expectedCounts: CapitalSourceCounts;
  legacyBudgetDetails: Array<Record<string, unknown>>;
  legacySummaryHistory: Array<Record<string, unknown>>;
  modernBudgets: Array<Record<string, unknown>>;
  modernDetails: Array<Record<string, unknown>>;
  modernSchedules: Array<Record<string, unknown>>;
};
