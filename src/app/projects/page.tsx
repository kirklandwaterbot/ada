import type { Metadata } from "next";
import { CapitalProjectExplorer } from "@/components/capital-project-explorer";
import { PageHeader } from "@/components/page-header";
import { SiteIcon } from "@/components/site-icon";
import { formatCapitalTimestamp } from "@/lib/mta-capital-format";
import { getMtaCapitalProjectSummaries } from "@/lib/mta-capital-projects";
import {
  LEGACY_SUMMARY_PAGE_URL,
  MODERN_DETAILS_PAGE_URL,
} from "@/lib/mta-capital-source.mjs";
import { regionalSystemSummaries } from "@/lib/regional-transit-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accessibility projects and coverage",
  description:
    "Regional accessibility coverage plus daily-checked MTA elevator and escalator capital projects.",
};

export default async function CapitalProjectsPage() {
  const dataset = await getMtaCapitalProjectSummaries().catch(() => null);
  const activeCount = dataset?.projects.filter((project) =>
    /active|construction|procurement/i.test(
      `${project.phase ?? ""} ${project.stage ?? ""}`,
    ),
  ).length ?? 0;
  const regionalStationCount = regionalSystemSummaries.reduce(
    (count, system) => count + system.stations,
    0,
  );

  return (
    <div className="page-enter space-y-7">
      <PageHeader
        actions={
          <>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--nav-active)] px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5"
              href={MODERN_DETAILS_PAGE_URL}
              rel="noreferrer"
              target="_blank"
            >
              New MTA dataset
              <SiteIcon className="text-[17px]" name="open_in_new" />
            </a>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--muted-strong)] shadow-sm transition hover:bg-[var(--soft)]"
              href={LEGACY_SUMMARY_PAGE_URL}
              rel="noreferrer"
              target="_blank"
            >
              Legacy dataset
              <SiteIcon className="text-[17px]" name="open_in_new" />
            </a>
          </>
        }
        description="Review accessibility coverage across the connected regional operators, then inspect detailed MTA project phases, milestones, budgets, and change history where a structured capital feed is available."
        eyebrow="Accessibility delivery"
        title="Projects and system coverage"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectMetric
          icon="construction"
          label="MTA projects"
          value={dataset?.metadata.projectCount ?? 0}
        />
        <ProjectMetric
          icon="update"
          label="Regional systems"
          value={regionalSystemSummaries.length}
        />
        <ProjectMetric
          icon="history"
          label="Regional stations"
          value={regionalStationCount}
        />
        <ProjectMetric
          icon="engineering"
          label="Active / delivery"
          value={activeCount}
        />
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
            Connected operators
          </p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]">
            Regional accessibility coverage
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted-strong)]">
            These systems contribute station accessibility and, where published,
            equipment status. Detailed project phases below currently come from MTA
            capital feeds; the site does not invent equivalent project milestones for
            operators that do not publish them in a connected structured source.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {regionalSystemSummaries.map((system) => (
            <article className="surface-card p-4" key={system.agency}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-[var(--ink)]">{system.label}</h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {system.accessibleStations.toLocaleString()} accessible of{" "}
                    {system.stations.toLocaleString()} stations
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
                  <SiteIcon className="text-[20px]" name="accessible" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
                <span className="font-semibold text-[var(--muted-strong)]">
                  {system.equipment.toLocaleString()} equipment records
                </span>
                {system.sourceUrl ? (
                  <a
                    aria-label={`Open official ${system.label} accessibility source`}
                    className="font-bold text-[var(--accent-700)] hover:underline"
                    href={system.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Official source ↗
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {dataset ? <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
        <div className="flex gap-3">
          <SiteIcon
            className="mt-0.5 shrink-0 text-[20px] text-blue-600 dark:text-blue-300"
            name="sync"
          />
          <div>
            <p className="font-extrabold">
              MTA capital sources checked {formatCapitalTimestamp(dataset.metadata.checkedAt)}
            </p>
            <p className="mt-1 leading-6 text-blue-900/80 dark:text-blue-100/75">
              The sync runs daily. MTA source records change on the agency&apos;s own
              publication schedule, so each project also shows the date of its newest
              underlying record. Current page source: {formatSourceMode(dataset.metadata.pageSourceMode)}.
            </p>
          </div>
        </div>
      </div> : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          MTA capital project details are temporarily unavailable. The regional
          accessibility coverage above remains available.
        </div>
      )}

      <section className="space-y-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
            MTA capital program
          </p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]">
            Detailed elevator and escalator projects
          </h2>
        </div>
      {dataset ? <CapitalProjectExplorer projects={dataset.projects} /> : null}
      </section>
    </div>
  );
}

function ProjectMetric({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
        <SiteIcon className="text-[21px]" name={icon} />
      </span>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-black tracking-[-0.04em] text-[var(--ink)]">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function formatSourceMode(mode: "database" | "live_api" | "local_snapshot") {
  if (mode === "database") return "daily database";
  if (mode === "live_api") return "live official API";
  return "checked-in daily snapshot";
}
