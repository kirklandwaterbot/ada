"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SiteIcon } from "@/components/site-icon";
import {
  normalizeStoredPositiveInteger,
  normalizeStoredString,
  usePersistentState,
} from "@/hooks/use-persistent-state";
import { getRegionalAgencyLabel, type RegionalEquipmentRecord } from "@/lib/regional-transit-data";
import type { RegionalTransitAgency } from "@/lib/regional-transit-branding";

const PAGE_SIZE = 40;
const EQUIPMENT_EXPLORER_STORAGE_KEYS = {
  agency: "access-nyc:equipment-explorer-agency:v1",
  limit: "access-nyc:equipment-explorer-limit:v1",
  query: "access-nyc:equipment-explorer-query:v1",
  status: "access-nyc:equipment-explorer-status:v1",
  type: "access-nyc:equipment-explorer-type:v1",
} as const;

export function RegionalEquipmentExplorer({
  records,
}: {
  records: RegionalEquipmentRecord[];
}) {
  const [query, setQuery] = usePersistentState(
    EQUIPMENT_EXPLORER_STORAGE_KEYS.query,
    "",
    normalizeStoredString,
  );
  const [agency, setAgency] = usePersistentState(
    EQUIPMENT_EXPLORER_STORAGE_KEYS.agency,
    "All",
    normalizeStoredString,
  );
  const [type, setType] = usePersistentState(
    EQUIPMENT_EXPLORER_STORAGE_KEYS.type,
    "All",
    normalizeStoredString,
  );
  const [status, setStatus] = usePersistentState(
    EQUIPMENT_EXPLORER_STORAGE_KEYS.status,
    "All",
    normalizeStoredString,
  );
  const [limit, setLimit] = usePersistentState(
    EQUIPMENT_EXPLORER_STORAGE_KEYS.limit,
    PAGE_SIZE,
    normalizeStoredPositiveInteger,
  );
  const agencies = useMemo(
    () =>
      [...new Set(records.map((record) => record.agency))].sort((left, right) =>
        getRegionalAgencyLabel(left).localeCompare(getRegionalAgencyLabel(right)),
      ),
    [records],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const queryMatches =
        !normalizedQuery ||
        [
          record.stationName,
          record.unitId,
          record.location,
          ...record.branchNames,
          getRegionalAgencyLabel(record.agency),
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const agencyMatches = agency === "All" || record.agency === agency;
      const typeMatches = type === "All" || record.type === type;
      const statusMatches = status === "All" || record.status === status;
      return queryMatches && agencyMatches && typeMatches && statusMatches;
    });
  }, [agency, query, records, status, type]);
  const visible = filtered.slice(0, limit);

  function reset() {
    setQuery("");
    setAgency("All");
    setType("All");
    setStatus("All");
    setLimit(PAGE_SIZE);
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-[var(--border)] p-5 sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
          Regional operators
        </p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]">
          Regional elevator and escalator records
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">
          Search equipment published for PATH, LIRR, Metro-North, NJ Transit,
          CTrail, and AirTrain. Availability and detail vary by operator.
        </p>

        <div className="mt-5 grid gap-2 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,0.32fr))]">
          <label className="relative">
            <span className="sr-only">Search regional equipment</span>
            <SiteIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px] text-[var(--muted)]" name="search" />
            <input
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] pl-10 pr-3 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--accent-500)] focus:ring-4 focus:ring-[var(--accent-ring)]"
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="Station, equipment ID, or location"
              type="search"
              value={query}
            />
          </label>
          <Filter label="System" onChange={setAgency} value={agency}>
            {agencies.map((item) => (
              <option key={item} value={item}>
                {getRegionalAgencyLabel(item as RegionalTransitAgency)}
              </option>
            ))}
          </Filter>
          <Filter label="Equipment" onChange={setType} value={type}>
            <option value="Elevator">Elevator</option>
            <option value="Escalator">Escalator</option>
          </Filter>
          <Filter label="Status" onChange={setStatus} value={status}>
            <option value="operational">In service</option>
            <option value="outage">Out of service</option>
            <option value="long_term_outage">Long-term outage</option>
            <option value="unknown">Status unavailable</option>
          </Filter>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted-strong)]">
          <p>{filtered.length.toLocaleString()} matching equipment records</p>
          {query || agency !== "All" || type !== "All" || status !== "All" ? (
            <button className="font-bold text-[var(--accent-700)] hover:underline" onClick={reset} type="button">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="divide-y divide-[var(--border)]">
          {visible.map((record) => (
            <article className="grid gap-4 p-5 transition hover:bg-[var(--soft-blue)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center sm:p-6" key={record.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-black text-[var(--ink)] hover:text-[var(--accent-700)]" href={`/stations/${record.stationSlug}`}>
                    {record.stationName}
                  </Link>
                  <StatusBadge status={record.status} />
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {getRegionalAgencyLabel(record.agency)} · {record.branchNames.join(" / ")}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs font-black text-[var(--ink)]">{record.unitId}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">{record.location}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--soft)] px-2.5 py-2 text-xs font-bold text-[var(--muted-strong)]">
                <SiteIcon className="text-[17px]" name={record.type === "Elevator" ? "elevator" : "escalator"} />
                {record.type}
              </span>
            </article>
          ))}
          {visible.length < filtered.length ? (
            <div className="p-5 text-center">
              <button className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-bold text-[var(--accent-700)] hover:bg-[var(--soft)]" onClick={() => setLimit((current) => current + PAGE_SIZE)} type="button">
                Show more equipment
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-10 text-center">
          <SiteIcon className="text-3xl text-[var(--muted)]" name="search_off" />
          <h3 className="mt-3 font-extrabold text-[var(--ink)]">No matching equipment</h3>
          <button className="mt-3 text-sm font-bold text-[var(--accent-700)] hover:underline" onClick={reset} type="button">
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}

function Filter({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-3 text-sm font-bold text-[var(--ink)] outline-none focus:border-[var(--accent-500)]" onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="All">All {label.toLowerCase()}s</option>
        {children}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: RegionalEquipmentRecord["status"] }) {
  const presentation =
    status === "operational"
      ? ["In service", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"]
      : status === "outage"
        ? ["Outage", "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"]
        : status === "long_term_outage"
          ? ["Long-term outage", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"]
          : ["Unknown", "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300"];

  return <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${presentation[1]}`}>{presentation[0]}</span>;
}
