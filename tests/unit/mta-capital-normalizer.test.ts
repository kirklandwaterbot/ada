import { describe, expect, it } from "vitest";
import {
  buildCapitalProjectDataset,
  isElevatorEscalatorProject,
} from "../../src/lib/mta-capital-normalizer.mjs";
import { formatCapitalMoney } from "../../src/lib/mta-capital-format";
import type { RawCapitalSourceBundle } from "../../src/lib/mta-capital-types";

const fixture: RawCapitalSourceBundle = {
  checkedAt: "2026-09-03T12:00:00.000Z",
  expectedCounts: {
    legacyBudgetDetails: 1,
    legacySummaryHistory: 2,
    modernBudgets: 3,
    modernDetails: 2,
    modernSchedules: 2,
  },
  legacyBudgetDetails: [
    {
      budget_submission_date: "Current",
      change_narrative: "Funding transferred to individual elevator projects.",
      plan_revision: "999999",
      plan_year_year_1_allocation: "270727",
      plan_year_year_3_allocation: "224164",
      project_number: "T9040701",
      total_allocation: "494891",
    },
  ],
  legacySummaryHistory: [
    {
      agency_name: "New York City Transit",
      capital_plan: "Capital Plan 2025 - 2029",
      current_budget: "494891421.60",
      element_description: "Station Escalators / Elevators",
      loaddate: "20260331",
      milestone_construction_start_mm: "06",
      milestone_construction_start_yyyy: "2027",
      original_budget: "520483004",
      percentage_complete: "25",
      phase: "Planning",
      proj_description: "Replace 45 Elevators",
      proj_num: "T9040701",
      scope_objective: "Replace elevators systemwide.",
    },
    {
      agency_name: "New York City Transit",
      current_budget: "520011404",
      element_description: "Station Escalators / Elevators",
      loaddate: "20250930",
      original_budget: "0",
      percentage_complete: "0",
      phase: "Planning",
      proj_description: "Replace 45 Elevators",
      proj_num: "T9040701",
      scope_objective: "Replace elevators systemwide.",
    },
  ],
  modernBudgets: [
    {
      acep: "T100",
      baseline_budget: "100",
      current_budget: "120",
      expenditures: "60",
      project_id: "8356",
      update_date: "2026-05-01T00:00:00",
    },
    {
      acep: "T200",
      baseline_budget: "50",
      current_budget: "55",
      expenditures: "20",
      project_id: "8356",
      update_date: "2026-05-01T00:00:00",
    },
    {
      acep: "T100",
      baseline_budget: "100",
      current_budget: "110",
      expenditures: "50",
      project_id: "8356",
      update_date: "2026-04-01T00:00:00",
    },
  ],
  modernDetails: [
    {
      agencies: "['New York City Transit']",
      description: "Install three new elevators at the station.",
      phase: "Construction",
      project_id: "8356",
      title: "ADA Station Improvements",
    },
    {
      description: "Replace track switches.",
      project_id: "9999",
      title: "Track work",
    },
  ],
  modernSchedules: [
    {
      activity_date: "2025-01-01T00:00:00",
      activity_title: "Contract award",
      phase: "Construction",
      phase_sequence: "3",
      phase_state: "Active",
      project_id: "8356",
      update_date: "2026-03-01T00:00:00",
    },
    {
      phase: "Financial Closeout",
      phase_sequence: "4",
      phase_state: "Pending",
      project_id: "8356",
      update_date: "2026-03-01T00:00:00",
    },
  ],
};

describe("Capital Plan normalization", () => {
  it("combines modern monthly budget lines and schedule milestones", () => {
    const dataset = buildCapitalProjectDataset(fixture);
    const project = dataset.projects.find((item) => item.source === "modern");

    expect(project?.currentBudget).toBe(175);
    expect(project?.originalBudget).toBe(150);
    expect(project?.expenditures).toBe(80);
    expect(project?.budgetHistory).toHaveLength(2);
    expect(project?.phases[0]?.milestones[0]?.title).toBe("Contract award");
    expect(project?.sourceRecordAsOf).toBe("2026-05-01");
  });

  it("keeps legacy percent complete, milestones, and plan allocations", () => {
    const dataset = buildCapitalProjectDataset(fixture);
    const project = dataset.projects.find((item) => item.source === "legacy");

    expect(project?.percentComplete).toBe(25);
    expect(project?.originalBudget).toBe(520_483_004);
    expect(project?.currentBudget).toBe(494_891_421.6);
    expect(project?.sourceRecordAsOf).toBe("2026-03-31");
    expect(project?.phases[0]?.milestones[0]).toMatchObject({
      date: "2027-06-01",
      title: "Construction start",
    });
    expect(project?.budgetRevisions[0]?.totalAllocation).toBe(494_891_000);
    expect(project?.budgetRevisions[0]?.allocations).toEqual([
      { amount: 270_727_000, label: "2025" },
      { amount: 224_164_000, label: "2027" },
    ]);
  });

  it("rejects truncated source responses before they can replace a snapshot", () => {
    expect(() =>
      buildCapitalProjectDataset({
        ...fixture,
        expectedCounts: { ...fixture.expectedCounts, modernBudgets: 4 },
      }),
    ).toThrow(/expected 4 rows but received 3/);
  });

  it("matches elevator and escalator language without broad ADA false positives", () => {
    expect(isElevatorEscalatorProject({ title: "Replace 43 Escalators" })).toBe(
      true,
    );
    expect(isElevatorEscalatorProject({ title: "ADA platform edge work" })).toBe(
      false,
    );
  });

  it("formats compact budgets deterministically for server hydration", () => {
    expect(formatCapitalMoney(319_000_000, "compact")).toBe("$319M");
    expect(formatCapitalMoney(168_829_388, "compact")).toBe("$169M");
    expect(formatCapitalMoney(6_900_000_000, "compact")).toBe("$6.9B");
  });
});
