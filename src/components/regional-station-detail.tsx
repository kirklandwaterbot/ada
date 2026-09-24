import Link from "next/link";
import { SiteIcon } from "@/components/site-icon";
import { StationStatusBadge } from "@/components/station-status-badge";
import { TransitRouteIcons } from "@/components/transit-route-icons";
import {
  getRegionalAgencyLabel,
  regionalSystemSummaries,
  type RegionalEquipmentUnit,
  type RegionalStation,
} from "@/lib/regional-transit-data";
import { getRegionalTransitBranding } from "@/lib/regional-transit-branding";
import { getRegionalStationServices } from "@/lib/regional-station-merge";

export function RegionalStationDetail({ station }: { station: RegionalStation }) {
  const services = getRegionalStationServices(station);
  const agencies = [...new Set(services.map((service) => service.agency))];
  const badges = services
    .flatMap((service) =>
      getRegionalTransitBranding(
        service.agency,
        service.branchId,
        service.serviceRouteIds.join(","),
      ).lines,
    )
    .filter(
      (badge, index, items) =>
        items.findIndex((candidate) => candidate.imagePath === badge.imagePath) ===
        index,
    );
  const equipment = [...station.elevators, ...station.escalators];
  const outageCount = equipment.filter(
    (unit) => unit.status === "outage" || unit.status === "long_term_outage",
  ).length;
  const officialSources = agencies
    .map((agency) =>
      regionalSystemSummaries.find((summary) => summary.agency === agency),
    )
    .filter((summary) => summary?.sourceUrl);

  return (
    <div className="page-enter space-y-7">
      <nav aria-label="Breadcrumb">
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--muted-strong)] transition hover:text-[var(--accent-700)]"
          href="/stations"
        >
          <SiteIcon className="text-[18px]" name="arrow_back" />
          Explore all systems
        </Link>
      </nav>

      <header className="relative overflow-hidden rounded-[1.5rem] bg-[var(--nav-active)] px-5 py-7 text-white shadow-[0_24px_60px_rgb(10_61_126_/_0.24)] sm:px-8 sm:py-9">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full border-[56px] border-white/5" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-200">
              Regional station profile
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] sm:text-5xl">
              {station.name}
            </h1>
            <TransitRouteIcons
              agency={station.agency}
              className="mt-4"
              regionalBadges={badges}
              routes={services.map((service) => service.branchName)}
            />
            <p className="mt-3 text-sm font-semibold text-blue-100 sm:text-base">
              {services
                .map(
                  (service) =>
                    `${getRegionalAgencyLabel(service.agency)} · ${service.branchName}`,
                )
                .join(" / ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StationStatusBadge
              station={{
                accessibilityStatus: station.accessibilityStatus,
                plannedAda: false,
              }}
            />
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
              href={`https://www.openstreetmap.org/?mlat=${station.latitude}&mlon=${station.longitude}#map=17/${station.latitude}/${station.longitude}`}
              rel="noreferrer"
              target="_blank"
            >
              <SiteIcon className="text-[18px]" name="location_on" />
              Open location
            </a>
          </div>
        </div>
      </header>

      <section aria-label="Station facts" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact icon="accessible" label="Accessibility" value={station.accessibilityStatus} />
        <Fact icon="account_tree" label="Systems" value={agencies.length.toLocaleString()} />
        <Fact icon="elevator" label="Listed equipment" value={equipment.length.toLocaleString()} />
        <Fact icon="warning" label="Current outages" value={outageCount.toLocaleString()} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="surface-card overflow-hidden">
          <SectionHeader
            description="Elevators and escalators published by the agencies serving this station."
            icon="elevator"
            title="Accessibility equipment"
          />
          {equipment.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {equipment.map((unit) => (
                <RegionalEquipmentCard
                  key={`${unit.agency}-${unit.type}-${unit.unitId}`}
                  unit={unit}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <SiteIcon className="text-3xl text-[var(--muted)]" name="info" />
              <h2 className="mt-3 font-extrabold text-[var(--ink)]">
                No individual equipment records published
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted-strong)]">
                The station&apos;s accessibility status is listed, but the connected source does
                not identify individual elevators or escalators here.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="surface-card p-5 sm:p-6">
            <h2 className="font-black text-[var(--ink)]">Station access</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
              {station.accessMethods?.length
                ? station.accessMethods.join(" · ")
                : "The source lists the station accessibility status without a separate access-method description."}
            </p>
            {station.serviceAlert ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="font-extrabold">Service notice</p>
                <p className="mt-1">{station.serviceAlert}</p>
              </div>
            ) : null}
          </div>

          <div className="surface-card p-5 sm:p-6">
            <h2 className="font-black text-[var(--ink)]">Official sources</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-strong)]">
              Always verify elevator availability and boarding conditions with the operator
              before traveling.
            </p>
            <div className="mt-4 space-y-2">
              {officialSources.map((source) => (
                <a
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold text-[var(--accent-700)] transition hover:bg-[var(--soft)]"
                  href={source!.sourceUrl!}
                  key={source!.agency}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source!.label}
                  <SiteIcon className="text-[17px]" name="open_in_new" />
                </a>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function RegionalEquipmentCard({ unit }: { unit: RegionalEquipmentUnit }) {
  const presentation = getStatusPresentation(unit.status);

  return (
    <article className="p-5 transition hover:bg-[var(--soft-blue)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--soft)] text-[var(--muted-strong)]">
            <SiteIcon className="text-[21px]" name={unit.type === "Elevator" ? "elevator" : "escalator"} />
          </span>
          <div>
            <h3 className="font-black text-[var(--ink)]">{unit.unitId}</h3>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {getRegionalAgencyLabel(unit.agency)} · {unit.type}
            </p>
          </div>
        </div>
        <span className={`inline-flex w-fit rounded-full px-2.5 py-1.5 text-xs font-bold ${presentation.className}`}>
          {presentation.label}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted-strong)]">{unit.location}</p>
      {unit.note ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{unit.note}</p> : null}
      {unit.lastUpdated ? (
        <p className="mt-2 text-[11px] font-semibold text-[var(--muted)]">
          Source updated {new Date(unit.lastUpdated).toLocaleString("en-US")}
        </p>
      ) : null}
    </article>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
        <SiteIcon className="text-[23px]" name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p>
        <p className="mt-0.5 truncate text-lg font-black text-[var(--ink)]">{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({ description, icon, title }: { description: string; icon: string; title: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] p-5 sm:p-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
        <SiteIcon className="text-[23px]" name={icon} />
      </span>
      <div>
        <h2 className="text-lg font-black text-[var(--ink)]">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--muted-strong)]">{description}</p>
      </div>
    </div>
  );
}

function getStatusPresentation(status: RegionalEquipmentUnit["status"]) {
  if (status === "operational") {
    return {
      className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      label: "In service",
    };
  }
  if (status === "outage") {
    return {
      className: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      label: "Out of service",
    };
  }
  if (status === "long_term_outage") {
    return {
      className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      label: "Long-term outage",
    };
  }
  return {
    className: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    label: "Status unavailable",
  };
}
