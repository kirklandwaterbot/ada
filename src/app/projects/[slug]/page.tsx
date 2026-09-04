import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteIcon } from "@/components/site-icon";
import {
  formatCapitalDate,
  formatCapitalMoney,
} from "@/lib/mta-capital-format";
import { getMtaCapitalProjectBySlug } from "@/lib/mta-capital-projects";
import type {
  CapitalBudgetRevision,
  CapitalPhase,
  CapitalProject,
} from "@/lib/mta-capital-types";

export const dynamic = "force-dynamic";

type CapitalProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: CapitalProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getMtaCapitalProjectBySlug(slug);

  return project
    ? {
        title: project.title,
        description: `${project.title} phase, milestones, percent complete, and budget history.`,
      }
    : { title: "Capital project not found" };
}

export default async function CapitalProjectDetailPage({
  params,
}: CapitalProjectPageProps) {
  const { slug } = await params;
  const project = await getMtaCapitalProjectBySlug(slug);

  if (!project) notFound();

  return (
    <div className="page-enter space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--muted)]">
          <li>
            <Link className="hover:text-[var(--accent-600)]" href="/projects">
              Capital projects
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-[var(--muted-strong)]">{project.externalId}</li>
        </ol>
      </nav>

      <header className="relative overflow-hidden rounded-[1.5rem] bg-[var(--nav-active)] px-5 py-7 text-white shadow-[0_24px_60px_rgb(10_61_126_/_0.24)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[38px] border-cyan-300/10" />
        <div className="relative max-w-5xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-200">
            <span>
              {project.source === "modern" ? "Dashboard" : "Legacy Capital Plan"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{project.externalId}</span>
          </div>
          <h1 className="mt-3 text-3xl font-black leading-tight tracking-[-0.045em] sm:text-4xl">
            {project.title}
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-blue-100 sm:text-base">
            {project.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <StatusPill icon="timeline" label={project.phase ?? "Phase not published"} />
            {project.stage && project.stage !== project.phase ? (
              <StatusPill icon="engineering" label={project.stage} />
            ) : null}
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-[#0a3d7e] transition hover:-translate-y-0.5"
              href={project.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Official source
              <SiteIcon className="text-[17px]" name="open_in_new" />
            </a>
          </div>
        </div>
      </header>

      <section aria-label="Project summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon="percent"
          label="Complete"
          value={
            project.percentComplete === null
              ? "Not published"
              : `${project.percentComplete.toFixed(0)}%`
          }
        />
        <SummaryMetric
          icon="payments"
          label="Current budget"
          value={formatCapitalMoney(project.currentBudget, "compact")}
        />
        <SummaryMetric
          icon="event"
          label="Started"
          value={formatCapitalDate(project.startDate)}
        />
        <SummaryMetric
          icon="event_available"
          label="Forecast finish"
          value={formatCapitalDate(project.estimatedCompletionDate)}
        />
      </section>

      {project.percentComplete !== null ? (
        <section className="surface-card p-5 sm:p-6" aria-labelledby="completion-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--accent-600)]">
                Delivery progress
              </p>
              <h2 className="mt-1 text-xl font-black text-[var(--ink)]" id="completion-heading">
                {project.percentComplete.toFixed(0)}% complete
              </h2>
            </div>
            <span className="text-sm font-bold text-[var(--muted)]">
              As of {formatCapitalDate(project.sourceRecordAsOf)}
            </span>
          </div>
          <progress
            aria-label="Project percent complete"
            className="mt-5 h-3 w-full overflow-hidden rounded-full accent-[var(--accent-600)]"
            max={100}
            value={project.percentComplete}
          />
        </section>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.7fr)]">
        <ProjectSchedule project={project} />
        <ProjectFacts project={project} />
      </div>

      <ProjectBudget project={project} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs font-medium text-[var(--muted-strong)]">
        <span className="inline-flex items-center gap-2">
          <SiteIcon className="text-[17px] text-[var(--accent-600)]" name="update" />
          Newest source record {formatCapitalDate(project.sourceRecordAsOf)}
        </span>
        <span>Checked daily; MTA records update on their published cadence.</span>
      </div>
    </div>
  );
}

function ProjectSchedule({ project }: { project: CapitalProject }) {
  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="schedule-heading">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <SiteIcon className="text-[21px]" name="account_tree" />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--accent-600)]">
            Schedule
          </p>
          <h2 className="text-xl font-black text-[var(--ink)]" id="schedule-heading">
            Phases and milestones
          </h2>
        </div>
      </div>

      {project.phases.length > 0 ? (
        <ol className="mt-6 space-y-4">
          {project.phases.map((phase) => (
            <PhaseCard key={`${phase.sequence ?? "phase"}-${phase.name}`} phase={phase} />
          ))}
        </ol>
      ) : (
        <p className="mt-6 rounded-xl bg-[var(--soft)] px-4 py-5 text-sm text-[var(--muted-strong)]">
          The source has not published a detailed milestone schedule for this project.
        </p>
      )}
    </section>
  );
}

function PhaseCard({ phase }: { phase: CapitalPhase }) {
  const state = phase.state ?? "Status not published";
  const active = /active|construction|progress/i.test(state);
  const complete = /complete/i.test(state);

  return (
    <li className="rounded-2xl border border-[var(--border)] bg-[var(--panel-raised)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={[
              "mt-1 h-3 w-3 shrink-0 rounded-full ring-4",
              complete
                ? "bg-emerald-500 ring-emerald-500/15"
                : active
                  ? "bg-blue-500 ring-blue-500/15"
                  : "bg-slate-400 ring-slate-400/15",
            ].join(" ")}
          />
          <div>
            <h3 className="font-extrabold text-[var(--ink)]">{phase.name}</h3>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{state}</p>
          </div>
        </div>
        <p className="text-xs font-bold text-[var(--muted-strong)]">
          {formatCapitalDate(phase.startDate)} – {formatCapitalDate(phase.endDate)}
        </p>
      </div>

      {phase.milestones.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {phase.milestones.map((milestone) => (
            <li
              className="grid gap-1 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]"
              key={`${milestone.title}-${milestone.date ?? "unknown"}`}
            >
              <span className="font-bold text-[var(--muted-strong)]">
                {formatCapitalDate(milestone.date)}
              </span>
              <span>
                <span className="font-extrabold text-[var(--ink)]">
                  {milestone.title}
                  {milestone.flagged ? (
                    <span className="ml-2 text-amber-600" title="Flagged by the source">
                      ●
                    </span>
                  ) : null}
                </span>
                {milestone.description ? (
                  <span className="mt-1 block leading-6 text-[var(--muted-strong)]">
                    {milestone.description}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ProjectFacts({ project }: { project: CapitalProject }) {
  const facts = [
    ["Agency", project.agencies.join(", ")],
    ["Asset category", project.assetCategories.join(", ")],
    ["Service", project.services.join(", ")],
    ["Capital plan", project.capitalPlans.join(", ")],
    ["Initiatives", project.initiatives.join(", ")],
    ["Needs code", project.needsCode],
    ["Contract", project.contractNumber],
    ["Contract type", project.contractType],
    ["Prime contractor", project.primeContractor],
    ["Budget status", project.budgetStatus],
    ["Schedule status", project.scheduleStatus],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <aside className="surface-card p-5 sm:p-6" aria-labelledby="facts-heading">
      <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--accent-600)]">
        Project record
      </p>
      <h2 className="mt-1 text-xl font-black text-[var(--ink)]" id="facts-heading">
        Key details
      </h2>
      <dl className="mt-5 divide-y divide-[var(--border)]">
        {facts.map(([label, value]) => (
          <div className="py-3" key={label}>
            <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-bold leading-6 text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function ProjectBudget({ project }: { project: CapitalProject }) {
  const latestLines = project.budgetHistory[0]?.lines ?? [];

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="budget-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--accent-600)]">
            Funding
          </p>
          <h2 className="mt-1 text-xl font-black text-[var(--ink)]" id="budget-heading">
            Budget detail and history
          </h2>
        </div>
        {project.budgetDeltaPercent !== null ? (
          <span
            className={[
              "rounded-full px-3 py-1.5 text-xs font-extrabold",
              project.budgetDeltaPercent > 10
                ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                : project.budgetDeltaPercent < -10
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
            ].join(" ")}
          >
            {project.budgetDeltaPercent > 0 ? "+" : ""}
            {project.budgetDeltaPercent.toFixed(1)}% vs. baseline
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BudgetMetric label="Original / baseline" value={project.originalBudget} />
        <BudgetMetric label="Current / forecast" value={project.currentBudget} />
        <BudgetMetric label="Expenditures" value={project.expenditures} />
        <BudgetMetric
          label="Baseline finish"
          textValue={formatCapitalDate(project.baselineCompletionDate)}
        />
      </div>

      {latestLines.length > 0 ? (
        <div className="mt-7">
          <h3 className="text-base font-extrabold text-[var(--ink)]">
            Latest budget by ACEP
          </h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-[var(--soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">ACEP</th>
                  <th className="px-4 py-3">Baseline</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Expenditures</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {latestLines.map((line) => (
                  <tr key={line.acep}>
                    <td className="px-4 py-3 font-extrabold text-[var(--ink)]">{line.acep}</td>
                    <td className="px-4 py-3">{formatCapitalMoney(line.baselineBudget)}</td>
                    <td className="px-4 py-3">{formatCapitalMoney(line.currentBudget)}</td>
                    <td className="px-4 py-3">{formatCapitalMoney(line.expenditures)}</td>
                    <td className="max-w-sm px-4 py-3 text-[var(--muted-strong)]">
                      {line.annotations ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {project.budgetRevisions.length > 0 ? (
        <div className="mt-7">
          <h3 className="text-base font-extrabold text-[var(--ink)]">
            Plan allocations and amendments
          </h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {project.budgetRevisions.map((revision) => (
              <BudgetRevisionCard
                key={`${revision.revision}-${revision.submissionLabel}`}
                revision={revision}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-7">
        <h3 className="text-base font-extrabold text-[var(--ink)]">Budget history</h3>
        {project.budgetHistory.length > 0 ? (
          <div className="mt-3 max-h-[34rem] overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Record date</th>
                  <th className="px-4 py-3">Baseline</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Expenditures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {project.budgetHistory.map((snapshot) => (
                  <tr key={snapshot.date}>
                    <td className="px-4 py-3 font-bold text-[var(--ink)]">
                      {formatCapitalDate(snapshot.date)}
                    </td>
                    <td className="px-4 py-3">{formatCapitalMoney(snapshot.baselineBudget)}</td>
                    <td className="px-4 py-3">{formatCapitalMoney(snapshot.currentBudget)}</td>
                    <td className="px-4 py-3">{formatCapitalMoney(snapshot.expenditures)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-[var(--soft)] px-4 py-5 text-sm text-[var(--muted-strong)]">
            The source has not published budget history for this project.
          </p>
        )}
      </div>
    </section>
  );
}

function BudgetRevisionCard({ revision }: { revision: CapitalBudgetRevision }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel-raised)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--accent-600)]">
            {revision.submissionLabel}
          </p>
          <p className="mt-1 text-lg font-black text-[var(--ink)]">
            {formatCapitalMoney(revision.totalAllocation)}
          </p>
        </div>
        <span className="text-xs font-bold text-[var(--muted)]">{revision.revision}</span>
      </div>
      {revision.allocations.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {revision.allocations.map((allocation) => (
            <div className="rounded-lg bg-[var(--soft)] px-3 py-2" key={allocation.label}>
              <dt className="text-[10px] font-bold uppercase text-[var(--muted)]">
                {allocation.label}
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-[var(--ink)]">
                {formatCapitalMoney(allocation.amount, "compact")}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {revision.changeNarrative ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted-strong)]">
          {revision.changeNarrative}
        </p>
      ) : null}
    </article>
  );
}

function StatusPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 text-sm font-bold text-white">
      <SiteIcon className="text-[18px] text-cyan-200" name={icon} />
      {label}
    </span>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
        <SiteIcon className="text-[21px]" name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-1 truncate text-base font-black text-[var(--ink)]">{value}</p>
      </div>
    </div>
  );
}

function BudgetMetric({
  label,
  textValue,
  value,
}: {
  label: string;
  textValue?: string;
  value?: number | null;
}) {
  return (
    <div className="rounded-2xl bg-[var(--soft)] px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-[var(--ink)]">
        {textValue ?? formatCapitalMoney(value ?? null, "compact")}
      </p>
    </div>
  );
}
