const MODERN_SOURCE_URL = "https://data.ny.gov/d/9hy6-8j6t";
const LEGACY_SOURCE_URL = "https://data.ny.gov/d/ehz8-ag3n";
const PROJECT_TERMS = /\b(?:elevator|elevators|escalator|escalators|vertical transportation)\b/i;

export function buildCapitalProjectDataset(
  bundle,
  pageSourceMode = "live_api",
) {
  validateBundle(bundle);

  const modernBudgetGroups = groupBy(bundle.modernBudgets, "project_id");
  const modernScheduleGroups = groupBy(bundle.modernSchedules, "project_id");
  const legacyHistoryGroups = groupBy(
    bundle.legacySummaryHistory.filter(isElevatorEscalatorProject),
    "proj_num",
  );
  const legacyBudgetGroups = groupBy(
    bundle.legacyBudgetDetails,
    "project_number",
  );

  const modernProjects = bundle.modernDetails
    .filter(isElevatorEscalatorProject)
    .map((row) =>
      normalizeModernProject(
        row,
        modernBudgetGroups.get(text(row.project_id)) ?? [],
        modernScheduleGroups.get(text(row.project_id)) ?? [],
      ),
    );
  const legacyProjects = Array.from(legacyHistoryGroups.entries()).map(
    ([projectNumber, history]) =>
      normalizeLegacyProject(
        projectNumber,
        history,
        legacyBudgetGroups.get(projectNumber) ?? [],
      ),
  );
  const projects = [...modernProjects, ...legacyProjects]
    .filter((project) => project.externalId && project.title)
    .sort(compareProjects);
  const keys = new Set(projects.map((project) => project.key));

  if (projects.length === 0 || keys.size !== projects.length) {
    throw new Error(
      "Capital project normalization produced no projects or duplicate project keys.",
    );
  }

  return {
    metadata: {
      checkedAt: bundle.checkedAt,
      legacyProjectCount: legacyProjects.length,
      modernProjectCount: modernProjects.length,
      pageSourceMode,
      projectCount: projects.length,
      sourceCounts: { ...bundle.expectedCounts },
    },
    projects,
  };
}

export function getCapitalProjectSummaries(projects) {
  return projects.map((project) => ({
    agencies: project.agencies,
    assetCategories: project.assetCategories,
    budgetDeltaPercent: project.budgetDeltaPercent,
    currentBudget: project.currentBudget,
    estimatedCompletionDate: project.estimatedCompletionDate,
    externalId: project.externalId,
    percentComplete: project.percentComplete,
    phase: project.phase,
    slug: project.slug,
    source: project.source,
    sourceRecordAsOf: project.sourceRecordAsOf,
    stage: project.stage,
    title: project.title,
  }));
}

export function isElevatorEscalatorProject(row) {
  return PROJECT_TERMS.test(
    [
      row.title,
      row.description,
      row.search_tags,
      row.proj_description,
      row.scope_objective,
      row.element_description,
    ]
      .map(text)
      .join(" "),
  );
}

function normalizeModernProject(row, budgetRows, scheduleRows) {
  const externalId = text(row.project_id);
  const budgetHistory = normalizeModernBudgetHistory(budgetRows);
  const phases = normalizeModernPhases(scheduleRows);
  const latestBudget = budgetHistory[0] ?? null;
  const originalBudget =
    latestBudget?.baselineBudget ?? nullableNumber(row.goal_project_cost);
  const currentBudget =
    latestBudget?.currentBudget ??
    nullableNumber(row.estimated_actual_project_cost);
  const sourceRecordAsOf = latestDate([
    ...budgetRows.map((item) => item.update_date),
    ...scheduleRows.map((item) => item.update_date),
  ]);

  return {
    agencies: parseList(row.agencies),
    assetCategories: parseList(row.asset_categories),
    baselineCompletionDate: normalizeDate(row.goal_completion_date),
    budgetDeltaPercent: percentageChange(originalBudget, currentBudget),
    budgetHistory,
    budgetRevisions: [],
    budgetStatus: nullableText(row.budget_status),
    capitalPlans: parseList(row.capital_plans),
    contractNumber: nullableText(row.contract_number),
    contractType: nullableText(row.contract_type),
    currentBudget,
    description: text(row.description) || "No project description is available.",
    estimatedCompletionDate: normalizeDate(
      row.estimated_actual_completion_date,
    ),
    expenditures: latestBudget?.expenditures ?? null,
    externalId,
    initiatives: parseList(row.initiatives),
    key: `modern:${externalId}`,
    needsCode: null,
    originalBudget,
    percentComplete: null,
    phase: nullableText(row.phase),
    phases,
    primeContractor: nullableText(row.prime_contractor),
    scheduleStatus: nullableText(row.schedule_status),
    services: parseList(row.services),
    slug: `modern-${externalId}`,
    source: "modern",
    sourceRecordAsOf,
    sourceUrl: MODERN_SOURCE_URL,
    stage: nullableText(row.stage),
    startDate: normalizeDate(row.start_date),
    title: text(row.title),
  };
}

function normalizeModernBudgetHistory(rows) {
  const byDate = groupBy(rows, "update_date");

  return Array.from(byDate.entries())
    .map(([rawDate, entries]) => {
      const lines = entries
        .map((entry) => ({
          acep: text(entry.acep) || "Unspecified",
          annotations: nullableText(entry.annotations),
          baselineBudget: nullableNumber(entry.baseline_budget),
          currentBudget: nullableNumber(entry.current_budget),
          expenditures: nullableNumber(entry.expenditures),
        }))
        .sort((left, right) => left.acep.localeCompare(right.acep));

      return {
        baselineBudget: sumNullable(
          lines.map((line) => line.baselineBudget),
        ),
        currentBudget: sumNullable(lines.map((line) => line.currentBudget)),
        date: normalizeDate(rawDate) ?? rawDate,
        expenditures: sumNullable(lines.map((line) => line.expenditures)),
        lines,
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function normalizeModernPhases(rows) {
  const latestUpdate = latestDate(rows.map((row) => row.update_date));
  const activeRows = latestUpdate
    ? rows.filter((row) => normalizeDate(row.update_date) === latestUpdate)
    : rows;
  const groups = new Map();

  for (const row of activeRows) {
    const phaseName = text(row.phase) || "Project phase";
    const sequence = nullableNumber(row.phase_sequence);
    const key = `${sequence ?? 999}:${phaseName}`;
    const current = groups.get(key) ?? {
      endDate: null,
      milestones: [],
      name: phaseName,
      sequence,
      startDate: null,
      state: null,
    };

    current.startDate ??= normalizeDate(row.phase_est_actual_start_date);
    current.endDate ??= normalizeDate(row.phase_est_actual_end_date);
    current.state ??= nullableText(row.phase_state);

    const title = nullableText(row.activity_title);
    if (title) {
      current.milestones.push({
        date: normalizeDate(row.activity_date),
        description: nullableText(row.activity_description),
        flagged: text(row.activity_flag) === "1",
        title,
      });
    }

    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((phase) => ({
      ...phase,
      milestones: uniqueMilestones(phase.milestones).sort((left, right) =>
        (left.date ?? "9999").localeCompare(right.date ?? "9999"),
      ),
    }))
    .sort((left, right) =>
      (left.sequence ?? 999) - (right.sequence ?? 999) ||
      left.name.localeCompare(right.name),
    );
}

function normalizeLegacyProject(projectNumber, rows, budgetRows) {
  const history = [...rows].sort((left, right) =>
    text(right.loaddate).localeCompare(text(left.loaddate)),
  );
  const latest = history[0] ?? {};
  const originalBudget = firstPositiveNumber(
    history.map((row) => row.original_budget),
  );
  const currentBudget = nullableNumber(latest.current_budget);
  const percentCompleteValue = nullableNumber(latest.percentage_complete);
  const percentComplete =
    percentCompleteValue === null
      ? null
      : Math.min(100, Math.max(0, percentCompleteValue));
  const milestones = [
    milestone(
      "Design start",
      legacyYearMonth(
        latest.milestone_design_start_yyyy,
        latest.milestone_design_start_mm,
      ),
    ),
    milestone(
      "Design complete",
      legacyYearMonth(
        latest.milestone_design_completion_yyyy,
        latest.milestone_design_completion_mm,
      ),
    ),
    milestone(
      "Construction start",
      legacyYearMonth(
        latest.milestone_construction_start_yyyy,
        latest.milestone_construction_start_mm,
      ),
    ),
    milestone(
      "Construction complete",
      legacyYearMonth(
        latest.milestone_construction_completion_yyyy,
        latest.milestone_construction_completion_mm,
      ),
    ),
  ].filter(Boolean);
  const phase = nullableText(latest.phase);

  return {
    agencies: uniqueStrings([text(latest.agency_name)]),
    assetCategories: uniqueStrings([
      text(latest.category_description),
      text(latest.element_description),
    ]),
    baselineCompletionDate: legacyYearMonth(
      latest.original_completion_yyyy,
      latest.original_completion_mm,
    ),
    budgetDeltaPercent:
      nullableNumber(latest.original_budget_vs_current_budget) ??
      percentageChange(originalBudget, currentBudget),
    budgetHistory: history
      .map((row) => ({
        baselineBudget:
          nullableNumber(row.original_budget) || originalBudget || null,
        currentBudget: nullableNumber(row.current_budget),
        date: normalizeLegacyLoadDate(row.loaddate),
        expenditures: null,
        lines: [],
      }))
      .filter((snapshot) => snapshot.date)
      .sort((left, right) => right.date.localeCompare(left.date)),
    budgetRevisions: normalizeLegacyBudgetRevisions(budgetRows, latest),
    budgetStatus: null,
    capitalPlans: uniqueStrings([text(latest.capital_plan)]),
    contractNumber: null,
    contractType: null,
    currentBudget,
    description:
      text(latest.scope_objective) || "No project description is available.",
    estimatedCompletionDate: legacyYearMonth(
      latest.current_completion_yyyy,
      latest.current_completion_mm,
    ),
    expenditures: null,
    externalId: projectNumber,
    initiatives: text(latest.ada_flag) === "Y" ? ["Accessibility"] : [],
    key: `legacy:${projectNumber}`,
    needsCode: nullableText(latest.needs_code),
    originalBudget,
    percentComplete,
    phase,
    phases: phase
      ? [
          {
            endDate: legacyYearMonth(
              latest.current_completion_yyyy,
              latest.current_completion_mm,
            ),
            milestones,
            name: phase,
            sequence: null,
            startDate: legacyYearMonth(
              latest.current_start_yyyy,
              latest.current_start_mm,
            ),
            state:
              percentComplete === 100
                ? "Complete"
                : percentComplete && percentComplete > 0
                  ? "Active"
                  : null,
          },
        ]
      : [],
    primeContractor: null,
    scheduleStatus: null,
    services: [],
    slug: `legacy-${projectNumber}`,
    source: "legacy",
    sourceRecordAsOf: normalizeLegacyLoadDate(latest.loaddate),
    sourceUrl: LEGACY_SOURCE_URL,
    stage: phase,
    startDate:
      legacyYearMonth(latest.current_start_yyyy, latest.current_start_mm) ??
      legacyYearMonth(latest.original_start_yyyy, latest.original_start_mm),
    title: text(latest.proj_description) || projectNumber,
  };
}

function normalizeLegacyBudgetRevisions(rows, summary) {
  const capitalPlanStart = Number(
    text(summary.capital_plan).match(/\b(20\d{2})\b/)?.[1],
  );

  return rows
    .map((row) => {
      const allocations = [];

      for (let index = 1; index <= 5; index += 1) {
        const amount = nullableNumber(row[`plan_year_year_${index}_allocation`]);
        if (amount === null || amount === 0) continue;
        allocations.push({
          amount: amount * 1_000,
          label: Number.isFinite(capitalPlanStart)
            ? String(capitalPlanStart + index - 1)
            : `Plan year ${index}`,
        });
      }

      const outYears = nullableNumber(row.out_years_allocation);
      if (outYears !== null && outYears !== 0) {
        allocations.push({ amount: outYears * 1_000, label: "Out years" });
      }

      const totalAllocation = nullableNumber(row.total_allocation);

      return {
        allocations,
        changeNarrative: nullableText(row.change_narrative),
        revision: text(row.plan_revision),
        submissionLabel: text(row.budget_submission_date) || "Unspecified",
        totalAllocation:
          totalAllocation === null ? null : totalAllocation * 1_000,
      };
    })
    .sort((left, right) => {
      if (left.submissionLabel === "Current") return -1;
      if (right.submissionLabel === "Current") return 1;
      return right.revision.localeCompare(left.revision);
    });
}

function validateBundle(bundle) {
  const sourceKeys = [
    "modernDetails",
    "modernBudgets",
    "modernSchedules",
    "legacySummaryHistory",
    "legacyBudgetDetails",
  ];

  if (!bundle || !bundle.checkedAt || !bundle.expectedCounts) {
    throw new Error("Capital project source bundle is missing metadata.");
  }

  for (const key of sourceKeys) {
    const rows = bundle[key];
    const expected = bundle.expectedCounts[key];

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Capital project source ${key} returned no rows.`);
    }

    if (!Number.isInteger(expected) || expected !== rows.length) {
      throw new Error(
        `Capital project source ${key} expected ${expected} rows but received ${rows.length}.`,
      );
    }
  }
}

function groupBy(rows, key) {
  const groups = new Map();

  for (const row of rows) {
    const value = text(row[key]);
    if (!value) continue;
    const values = groups.get(value) ?? [];
    values.push(row);
    groups.set(value, values);
  }

  return groups;
}

function milestone(title, date) {
  return date
    ? { date, description: null, flagged: false, title }
    : null;
}

function uniqueMilestones(milestones) {
  const seen = new Set();

  return milestones.filter((item) => {
    const key = `${item.title}:${item.date ?? ""}:${item.description ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseList(value) {
  if (Array.isArray(value)) return uniqueStrings(value.map(text));
  const raw = text(value).trim();
  if (!raw) return [];
  const withoutBrackets = raw.replace(/^\[/, "").replace(/\]$/, "");
  return uniqueStrings(
    withoutBrackets
      .split(",")
      .map((item) => item.trim().replace(/^['\"]|['\"]$/g, "")),
  );
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function normalizeLegacyLoadDate(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : normalizeDate(raw);
}

function legacyYearMonth(yearValue, monthValue) {
  const year = text(yearValue).match(/20\d{2}/)?.[0];
  if (!year) return null;
  const monthRaw = text(monthValue).toLowerCase().replaceAll(".", "");
  const monthNames = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const numericMonth = Number(monthRaw);
  const month =
    Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12
      ? numericMonth
      : monthNames[monthRaw.slice(0, 3)];

  return month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
}

function normalizeDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const isoPrefix = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoPrefix) return isoPrefix;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

function latestDate(values) {
  const dates = values.map(normalizeDate).filter(Boolean).sort();
  return dates.at(-1) ?? null;
}

function nullableNumber(value) {
  if (value === null || typeof value === "undefined" || text(value) === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = nullableNumber(value);
    if (number !== null && number > 0) return number;
  }
  return null;
}

function sumNullable(values) {
  const numbers = values.filter((value) => typeof value === "number");
  return numbers.length > 0
    ? numbers.reduce((total, value) => total + value, 0)
    : null;
}

function percentageChange(baseline, current) {
  if (baseline === null || current === null || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function nullableText(value) {
  const valueText = text(value).trim();
  return valueText ? valueText : null;
}

function text(value) {
  return value === null || typeof value === "undefined" ? "" : String(value);
}

function compareProjects(left, right) {
  const leftDate = left.sourceRecordAsOf ?? "";
  const rightDate = right.sourceRecordAsOf ?? "";
  return (
    rightDate.localeCompare(leftDate) ||
    left.title.localeCompare(right.title, undefined, { numeric: true })
  );
}
