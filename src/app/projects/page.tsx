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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Capital projects",
  description:
    "Daily-checked MTA elevator and escalator capital projects with milestones, phase, budgets, and historical changes.",
};

export default async function CapitalProjectsPage() {
  const dataset = await getMtaCapitalProjectSummaries();
  const activeCount = dataset.projects.filter((project) =>
    /active|construction|procurement/i.test(
      `${project.phase ?? ""} ${project.stage ?? ""}`,
    ),
  ).length;

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
        description="Track elevator and escalator work across the newer MTA project feeds and the legacy Capital Plan records, including phases, completion, milestone dates, budgets, and change history."
        eyebrow="Capital delivery"
        title="Elevator and escalator projects"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectMetric
          icon="construction"
          label="Projects"
          value={dataset.metadata.projectCount}
        />
        <ProjectMetric
          icon="update"
          label="Dashboard"
          value={dataset.metadata.modernProjectCount}
        />
        <ProjectMetric
          icon="history"
          label="Legacy plan"
          value={dataset.metadata.legacyProjectCount}
        />
        <ProjectMetric
          icon="engineering"
          label="Active / delivery"
          value={activeCount}
        />
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
        <div className="flex gap-3">
          <SiteIcon
            className="mt-0.5 shrink-0 text-[20px] text-blue-600 dark:text-blue-300"
            name="sync"
          />
          <div>
            <p className="font-extrabold">
              Official sources checked {formatCapitalTimestamp(dataset.metadata.checkedAt)}
            </p>
            <p className="mt-1 leading-6 text-blue-900/80 dark:text-blue-100/75">
              The sync runs daily. MTA source records change on the agency&apos;s own
              publication schedule, so each project also shows the date of its newest
              underlying record. Current page source: {formatSourceMode(dataset.metadata.pageSourceMode)}.
            </p>
          </div>
        </div>
      </div>

      <CapitalProjectExplorer projects={dataset.projects} />
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
