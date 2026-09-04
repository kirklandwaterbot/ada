"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { SiteIcon } from "@/components/site-icon";
import {
  formatCapitalDate,
  formatCapitalMoney,
} from "@/lib/mta-capital-format";
import type { CapitalProjectSummary } from "@/lib/mta-capital-types";
import { matchesNormalizedSearch } from "@/lib/search-normalization";

const INITIAL_RESULT_COUNT = 24;

export function CapitalProjectExplorer({
  projects,
}: {
  projects: CapitalProjectSummary[];
}) {
  const [agency, setAgency] = useState("All");
  const [phase, setPhase] = useState("All");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_RESULT_COUNT);
  const deferredQuery = useDeferredValue(query);
  const agencies = useMemo(
    () =>
      Array.from(new Set(projects.flatMap((project) => project.agencies))).sort(),
    [projects],
  );
  const phases = useMemo(
    () =>
      Array.from(
        new Set(projects.map((project) => project.phase).filter(Boolean)),
      ).sort() as string[],
    [projects],
  );
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = matchesNormalizedSearch(
          [
            project.externalId,
            project.title,
            project.phase ?? undefined,
            project.stage ?? undefined,
            ...project.agencies,
            ...project.assetCategories,
          ],
          deferredQuery,
        );
        const matchesAgency =
          agency === "All" || project.agencies.includes(agency);
        const matchesPhase = phase === "All" || project.phase === phase;
        const matchesSource = source === "All" || project.source === source;
        return matchesQuery && matchesAgency && matchesPhase && matchesSource;
      }),
    [agency, deferredQuery, phase, projects, source],
  );
  const visibleProjects = filteredProjects.slice(0, visibleCount);
  const hasFilters =
    query.trim() !== "" || agency !== "All" || phase !== "All" || source !== "All";

  function clearFilters() {
    setAgency("All");
    setPhase("All");
    setQuery("");
    setSource("All");
    setVisibleCount(INITIAL_RESULT_COUNT);
  }

  return (
    <section aria-labelledby="capital-project-results">
      <div className="surface-card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(10rem,0.35fr))_auto]">
          <label className="relative block">
            <span className="sr-only">Search capital projects</span>
            <SiteIcon
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-[var(--muted)]"
              name="search"
            />
            <input
              className="h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] pl-11 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Project, ID, phase, or agency"
              type="search"
              value={query}
            />
          </label>
          <FilterSelect label="Agency" onChange={setAgency} value={agency}>
            <option value="All">All agencies</option>
            {agencies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Phase" onChange={setPhase} value={phase}>
            <option value="All">All phases</option>
            {phases.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Source" onChange={setSource} value={source}>
            <option value="All">Both sources</option>
            <option value="modern">Dashboard</option>
            <option value="legacy">Legacy plan</option>
          </FilterSelect>
          <button
            className="h-12 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-bold text-[var(--muted-strong)] transition hover:bg-[var(--soft)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!hasFilters}
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--accent-600)]">
            Matched projects
          </p>
          <h2
            className="mt-1 text-2xl font-black tracking-[-0.035em] text-[var(--ink)]"
            id="capital-project-results"
          >
            {filteredProjects.length.toLocaleString()} results
          </h2>
        </div>
        <p aria-live="polite" className="text-xs font-medium text-[var(--muted)]">
          Showing {visibleProjects.length.toLocaleString()} of{" "}
          {filteredProjects.length.toLocaleString()}
        </p>
      </div>

      {visibleProjects.length > 0 ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {visibleProjects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      ) : (
        <div className="surface-card mt-4 px-6 py-14 text-center">
          <SiteIcon
            className="mx-auto text-[34px] text-[var(--muted)]"
            name="search_off"
          />
          <h3 className="mt-3 text-lg font-extrabold text-[var(--ink)]">
            No projects match those filters
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Try a broader project term or clear the source and phase filters.
          </p>
        </div>
      )}

      {visibleCount < filteredProjects.length ? (
        <div className="mt-6 flex justify-center">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-5 text-sm font-bold text-[var(--ink)] shadow-sm transition hover:bg-[var(--soft)]"
            onClick={() => setVisibleCount((count) => count + INITIAL_RESULT_COUNT)}
            type="button"
          >
            Show more projects
            <SiteIcon className="text-[18px]" name="expand_more" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProjectCard({ project }: { project: CapitalProjectSummary }) {
  const progress = project.percentComplete;

  return (
    <article
      className="surface-card flex flex-col p-5 [content-visibility:auto] sm:p-6"
      data-testid="capital-project-result"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--soft-blue)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--accent-700)] dark:text-blue-200">
          {project.source === "modern" ? "Dashboard" : "Legacy plan"}
        </span>
        <span className="text-xs font-bold text-[var(--muted)]">
          {project.externalId}
        </span>
        <span className="ml-auto rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted-strong)]">
          {project.phase ?? project.stage ?? "Phase not published"}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-black leading-6 tracking-[-0.025em] text-[var(--ink)]">
        <Link className="hover:text-[var(--accent-600)]" href={`/projects/${project.slug}`}>
          {project.title}
        </Link>
      </h3>
      <p className="mt-2 text-sm text-[var(--muted-strong)]">
        {project.agencies.join(" · ") || "Agency not published"}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-3">
        <CardMetric
          label="Current budget"
          value={formatCapitalMoney(project.currentBudget, "compact")}
        />
        <CardMetric
          label="Forecast finish"
          value={formatCapitalDate(project.estimatedCompletionDate)}
        />
        <CardMetric
          className="col-span-2 sm:col-span-1"
          label="Source record"
          value={formatCapitalDate(project.sourceRecordAsOf)}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-bold">
          <span className="text-[var(--muted-strong)]">Percent complete</span>
          <span className="text-[var(--ink)]">
            {progress === null ? "Not published" : `${progress.toFixed(0)}%`}
          </span>
        </div>
        {progress === null ? (
          <div
            aria-hidden="true"
            className="mt-2 h-2 w-full rounded-full bg-[var(--soft)]"
          />
        ) : (
          <progress
            aria-label={`${project.title} percent complete`}
            className="mt-2 h-2 w-full overflow-hidden rounded-full accent-[var(--accent-600)]"
            max={100}
            value={progress}
          />
        )}
      </div>

      <Link
        className="mt-5 inline-flex items-center gap-1.5 self-start text-sm font-extrabold text-[var(--accent-600)] hover:text-[var(--accent-700)]"
        href={`/projects/${project.slug}`}
      >
        Project details
        <SiteIcon className="text-[18px]" name="arrow_forward" />
      </Link>
    </article>
  );
}

function CardMetric({
  className = "",
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function FilterSelect({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-3 text-sm font-semibold text-[var(--muted-strong)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}
