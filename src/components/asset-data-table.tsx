"use client";

import { useEffect, useMemo, useState } from "react";
import type { MtaAsset } from "@/lib/mta-assets";

type SortDirection = "asc" | "desc";

type AssetApiResponse = {
  assets: MtaAsset[];
  columns: string[];
};

type TableViewState = {
  borough: string;
  facetColumn: string;
  facetValues: Record<string, string[]>;
  query: string;
  sortColumn: string;
  sortDirection: SortDirection;
  type: string;
};

const STORAGE_KEY = "mta-access-assets-table-view";
const EMPTY_ASSETS: MtaAsset[] = [];
const EMPTY_COLUMNS: string[] = [];
const DEFAULT_TABLE_VIEW: TableViewState = {
  borough: "All",
  facetColumn: "borough",
  facetValues: {},
  query: "",
  sortColumn: "equipment_code",
  sortDirection: "asc",
  type: "All",
};

export function AssetDataTable() {
  const [data, setData] = useState<AssetApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TableViewState>(() => readStoredTableView());

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/assets");

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const payload = (await response.json()) as AssetApiResponse;

        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load asset rows.",
          );
        }
      }
    }

    loadRows();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  }, [view]);

  const assets = data?.assets ?? EMPTY_ASSETS;
  const columns = data?.columns ?? EMPTY_COLUMNS;
  const {
    borough,
    facetColumn,
    facetValues,
    query,
    sortColumn,
    sortDirection,
    type,
  } = view;

  const boroughs = useMemo(
    () => getUniqueValues(assets, "borough").filter((value) => value !== "-"),
    [assets],
  );

  const selectedFacetValues = facetValues[facetColumn] ?? [];
  const facetOptions = useMemo(
    () => getUniqueValues(assets, facetColumn).slice(0, 80),
    [assets, facetColumn],
  );

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      const matchesQuery = !normalizedQuery
        ? true
        : Object.values(asset)
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedQuery));

      const matchesBorough = borough === "All" ? true : asset.borough === borough;
      const matchesType = type === "All" ? true : asset.elevator_or_escalator === type;
      const matchesFacets = Object.entries(facetValues).every(
        ([column, selectedValues]) =>
          selectedValues.length === 0
            ? true
            : selectedValues.includes(normalizeCellValue(asset[column])),
      );

      return matchesQuery && matchesBorough && matchesType && matchesFacets;
    });

    return filtered.sort((a, b) => {
      const left = normalizeCellValue(a[sortColumn]);
      const right = normalizeCellValue(b[sortColumn]);
      const comparison = left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [assets, borough, facetValues, query, sortColumn, sortDirection, type]);

  const activeFacetCount = Object.values(facetValues).reduce(
    (count, values) => count + values.length,
    0,
  );

  const clearFilters = () => {
    updateView({
      borough: "All",
      facetValues: {},
      query: "",
      type: "All",
    });
  };

  const updateView = (nextView: Partial<TableViewState>) => {
    setView((current) => ({ ...current, ...nextView }));
  };

  const toggleFacetValue = (value: string) => {
    setView((current) => {
      const currentValues = current.facetValues[current.facetColumn] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      const nextFacetValues = { ...current.facetValues };

      if (nextValues.length === 0) {
        delete nextFacetValues[current.facetColumn];
      } else {
        nextFacetValues[current.facetColumn] = nextValues;
      }

      return { ...current, facetValues: nextFacetValues };
    });
  };

  const handleHeaderSort = (column: string) => {
    if (sortColumn === column) {
      updateView({ sortDirection: sortDirection === "asc" ? "desc" : "asc" });
      return;
    }

    updateView({ sortColumn: column, sortDirection: "asc" });
  };

  const clearFacetColumn = (column: string) => {
    setView((current) => {
      const nextFacetValues = { ...current.facetValues };
      delete nextFacetValues[column];

      return { ...current, facetValues: nextFacetValues };
    });
  };

  const clearFacetValue = (column: string, value: string) => {
    setView((current) => {
      const nextValues = (current.facetValues[column] ?? []).filter(
        (item) => item !== value,
      );
      const nextFacetValues = { ...current.facetValues };

      if (nextValues.length === 0) {
        delete nextFacetValues[column];
      } else {
        nextFacetValues[column] = nextValues;
      }

      return {
        ...current,
        facetColumn: column,
        facetValues: nextFacetValues,
      };
    });
  };

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-2xl border border-zinc-100 bg-white p-5 text-sm text-zinc-500 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-white/10">
        Loading interactive SQL data grid...
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_220px_140px]">
          <input
            aria-label="Search any column"
            className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            onChange={(event) => updateView({ query: event.target.value })}
            placeholder="Search any column"
            value={query}
          />
          <select
            aria-label="Filter by borough"
            className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            onChange={(event) => updateView({ borough: event.target.value })}
            value={borough}
          >
            <option>All</option>
            {boroughs.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <select
            aria-label="Filter by equipment type"
            className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            onChange={(event) => updateView({ type: event.target.value })}
            value={type}
          >
            <option>All</option>
            <option>Elevator</option>
            <option>Escalator</option>
          </select>
          <select
            aria-label="Sort column"
            className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            onChange={(event) => updateView({ sortColumn: event.target.value })}
            value={sortColumn}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                Sort: {formatColumnLabel(column)}
              </option>
            ))}
          </select>
          <button
            className="h-11 rounded-md bg-zinc-100 px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            onClick={() =>
              updateView({
                sortDirection: sortDirection === "asc" ? "desc" : "asc",
              })
            }
            type="button"
          >
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
          <div>
            <label className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
              Filter values by column
            </label>
            <select
              aria-label="Choose column for value filters"
              className="mt-2 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              onChange={(event) => updateView({ facetColumn: event.target.value })}
              value={facetColumn}
            >
              {columns.map((column) => (
                <option key={column} value={column}>
                  {formatColumnLabel(column)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
                Click values to include
              </p>
              <button
                className="text-xs font-semibold text-[var(--accent-700)] hover:underline dark:text-zinc-200"
                onClick={() => clearFacetColumn(facetColumn)}
                type="button"
              >
                Clear column
              </button>
            </div>
            <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
              {facetOptions.map((value) => {
                const active = selectedFacetValues.includes(value);

                return (
                  <button
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      active
                        ? "bg-[var(--accent-600)] text-white"
                        : "bg-white text-zinc-700 ring-1 ring-zinc-900/5 hover:bg-[var(--accent-50)] dark:bg-zinc-800 dark:text-zinc-200 dark:ring-white/10",
                    ].join(" ")}
                    key={value}
                    onClick={() => toggleFacetValue(value)}
                    type="button"
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {activeFacetCount > 0 || query || borough !== "All" || type !== "All" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
              Active filters
            </span>
            {query ? (
              <FilterChip label={`Search: ${query}`} onClear={() => updateView({ query: "" })} />
            ) : null}
            {borough !== "All" ? (
              <FilterChip
                label={`Borough: ${borough}`}
                onClear={() => updateView({ borough: "All" })}
              />
            ) : null}
            {type !== "All" ? (
              <FilterChip label={`Type: ${type}`} onClear={() => updateView({ type: "All" })} />
            ) : null}
            {Object.entries(facetValues).flatMap(([column, values]) =>
              values.map((value) => (
                <FilterChip
                  key={`${column}-${value}`}
                  label={`${formatColumnLabel(column)}: ${value}`}
                  onClear={() => {
                    clearFacetValue(column, value);
                  }}
                />
              )),
            )}
            <button
              className="ml-auto text-xs font-semibold text-[var(--accent-700)] hover:underline dark:text-zinc-200"
              onClick={clearFilters}
              type="button"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Showing all {filteredAssets.length.toLocaleString()} of{" "}
          {assets.length.toLocaleString()} loaded assets
        </p>
        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
          API: /api/assets
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px] border-collapse text-left text-[length:var(--asset-table-font-size)]">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                {columns.map((column) => (
                  <HeaderCell
                    active={sortColumn === column}
                    direction={sortDirection}
                    key={column}
                    onClick={() => handleHeaderSort(column)}
                  >
                    {formatColumnLabel(column)}
                  </HeaderCell>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr
                  className="border-t border-zinc-100 align-top transition hover:bg-[var(--accent-50)] dark:border-zinc-800 dark:hover:bg-[rgb(var(--accent-600-rgb)_/_0.16)]"
                  key={asset.equipment_code}
                >
                  {columns.map((column) => (
                    <AssetCell asset={asset} column={column} key={column} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HeaderCell({
  active,
  children,
  direction,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="whitespace-nowrap px-4 py-3 font-semibold">
      <button
        className={[
          "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:text-[var(--accent-700)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]",
          active ? "text-[var(--accent-700)] dark:text-zinc-100" : "",
        ].join(" ")}
        onClick={onClick}
        type="button"
      >
        {children}
        {active ? <span aria-hidden="true">{direction === "asc" ? "^" : "v"}</span> : null}
      </button>
    </th>
  );
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-50)] px-3 py-1 text-xs font-semibold text-[var(--accent-700)] ring-1 ring-[var(--accent-ring)] dark:bg-[rgb(var(--accent-600-rgb)_/_0.24)] dark:text-zinc-100"
      onClick={onClear}
      type="button"
    >
      {label}
      <span aria-hidden="true">x</span>
    </button>
  );
}

function AssetCell({ asset, column }: { asset: MtaAsset; column: string }) {
  const rawValue = asset[column];
  const value = column.endsWith("_date")
    ? formatDatasetDate(rawValue)
    : rawValue || "-";
  const isImportant =
    column === "equipment_code" ||
    column === "station_description" ||
    column === "elevator_or_escalator";

  return (
    <td
      className={[
        "max-w-[24rem] whitespace-normal px-4 py-[var(--asset-row-padding-y)] leading-6 text-zinc-600 dark:text-zinc-400",
        isImportant ? "font-semibold text-zinc-800 dark:text-zinc-100" : "",
        column === "equipment_code" ||
        column === "station_name" ||
        column === "subway_line"
          ? "font-mono text-xs"
          : "",
      ].join(" ")}
    >
      {column === "elevator_or_escalator" && rawValue ? (
        <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {rawValue}
        </span>
      ) : (
        value
      )}
    </td>
  );
}

function formatColumnLabel(column: string) {
  return column.replaceAll("_", " ");
}

function getUniqueValues(assets: MtaAsset[], column: string) {
  return Array.from(
    new Set(assets.map((asset) => normalizeCellValue(asset[column]))),
  ).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function normalizeCellValue(value: string | undefined) {
  return value?.trim() || "-";
}

function formatDatasetDate(value?: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function readStoredTableView(): TableViewState {
  if (typeof window === "undefined") {
    return DEFAULT_TABLE_VIEW;
  }

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);

    if (!storedValue) {
      return DEFAULT_TABLE_VIEW;
    }

    const parsed = JSON.parse(storedValue) as Partial<TableViewState>;

    return {
      borough: typeof parsed.borough === "string" ? parsed.borough : DEFAULT_TABLE_VIEW.borough,
      facetColumn:
        typeof parsed.facetColumn === "string"
          ? parsed.facetColumn
          : DEFAULT_TABLE_VIEW.facetColumn,
      facetValues: isFacetValues(parsed.facetValues)
        ? parsed.facetValues
        : DEFAULT_TABLE_VIEW.facetValues,
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_TABLE_VIEW.query,
      sortColumn:
        typeof parsed.sortColumn === "string"
          ? parsed.sortColumn
          : DEFAULT_TABLE_VIEW.sortColumn,
      sortDirection:
        parsed.sortDirection === "desc" || parsed.sortDirection === "asc"
          ? parsed.sortDirection
          : DEFAULT_TABLE_VIEW.sortDirection,
      type: typeof parsed.type === "string" ? parsed.type : DEFAULT_TABLE_VIEW.type,
    };
  } catch {
    return DEFAULT_TABLE_VIEW;
  }
}

function isFacetValues(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (items) =>
      Array.isArray(items) && items.every((item) => typeof item === "string"),
  );
}
