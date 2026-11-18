import type { Metadata } from "next";
import { NewsFeed } from "@/components/news-feed";
import { OpeningSign } from "@/components/opening-sign";
import { PageHeader } from "@/components/page-header";
import { SiteIcon } from "@/components/site-icon";
import {
  formatNewsDate,
  formatRelative,
  getAccessibilityNews,
  getOpeningsAwaitingReview,
  getVerifiedOpenings,
  type NewsFeedItem,
  type StationOpening,
} from "@/lib/accessibility-news";
import { getStationSlug, stations } from "@/lib/stations";

// "Checked 2 hr ago" is computed on the server; refresh it regularly.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Newly accessible stations",
  description:
    "Stations that recently became accessible, each with the MTA release, news story, or Reddit post that confirms it.",
};

const REVIEW_REASON: Record<string, string> = {
  ambiguous: "The station name matches more than one line and the post doesn't say which.",
  "no-station": "Reports an opening but doesn't name the station.",
};

export default function UpdatesPage() {
  const news = getAccessibilityNews();
  const verified = getVerifiedOpenings();
  const pending = getOpeningsAwaitingReview();
  const unresolved = news.feed.filter(
    (item) => item.opening && item.status === "needs-review" && item.stations.length === 0,
  );
  const thisYear = new Date().getFullYear();
  const openedThisYear = verified.filter(
    (opening) => new Date(opening.openedAt).getFullYear() === thisYear,
  ).length;

  return (
    <div className="page-enter space-y-12">
      <PageHeader
        description="When a station gets working elevators or ramps, it appears here with the MTA release, news story, or Reddit post that confirms it, and the station's status updates across the site. Sources are checked every three hours."
        title="Newly accessible stations"
      >
        <SourceStatus checkedAt={news.checkedAt} sources={news.sources} />
      </PageHeader>

      <section aria-labelledby="opened-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-[-0.015em]" id="opened-heading">
            Opened
          </h2>
          {verified.length > 0 ? (
            <p className="text-[15px] text-[var(--muted-strong)]">
              {openedThisYear} found in {thisYear}
            </p>
          ) : null}
        </div>

        {verified.length === 0 ? (
          <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 py-8">
            <p className="max-w-[60ch] text-[var(--muted-strong)]">
              No newly accessible stations found yet. The tracker checks MTA press
              releases, NYC news outlets, and Reddit every three hours and lists each
              opening here with its sources.
            </p>
            <a
              className="mt-4 inline-flex items-center gap-2 font-semibold text-[var(--accent-600)] underline-offset-4 hover:underline"
              href="https://www.mta.info/project/station-accessibility-upgrades"
              rel="noreferrer"
              target="_blank"
            >
              See the MTA&apos;s station accessibility projects
              <SiteIcon className="text-[15px]" name="open_in_new" />
            </a>
          </div>
        ) : (
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            {verified.map((opening, index) => (
              <OpeningSign
                index={index}
                key={opening.key}
                opening={opening}
                stationHref={stationHref(opening)}
              />
            ))}
          </div>
        )}
      </section>

      {pending.length + unresolved.length > 0 ? (
        <section aria-labelledby="review-heading">
          <h2 className="text-2xl font-bold tracking-[-0.015em]" id="review-heading">
            Waiting for confirmation
          </h2>
          <p className="mt-2 max-w-[62ch] text-[var(--muted-strong)]">
            These reports haven&apos;t changed any station yet. A station updates once
            the MTA, a news outlet, or a second independent post confirms it.
          </p>
          <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {pending.map((opening) => (
              <PendingRow
                detail="Photo report from Reddit. Needs an official source, a news story, or a second post."
                href={opening.evidence[0]?.discussionUrl ?? opening.evidence[0]?.url}
                key={opening.key}
                meta={`${opening.evidence[0]?.source ?? "Reddit"}, ${formatNewsDate(opening.openedAt)}`}
                title={`${opening.station} (${opening.services.join(", ")})`}
              />
            ))}
            {unresolved.map((item: NewsFeedItem) => (
              <PendingRow
                detail={REVIEW_REASON[item.reason] ?? "From a source the tracker doesn't recognize yet."}
                href={item.discussionUrl ?? item.url}
                key={item.id}
                meta={`${item.source}, ${formatNewsDate(item.publishedAt)}`}
                title={item.title}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="coverage-heading">
        <h2 className="text-2xl font-bold tracking-[-0.015em]" id="coverage-heading">
          Recent accessibility coverage
        </h2>
        <p className="mt-2 max-w-[62ch] text-[var(--muted-strong)]">
          Everything the tracker read about elevators, ramps, and ADA work, including
          announcements of future projects that don&apos;t change a station yet.
        </p>
        <div className="mt-5">
          <NewsFeed items={news.feed} />
        </div>
      </section>

      <section
        aria-labelledby="method-heading"
        className="grid gap-6 border-t border-[var(--border)] pt-8 lg:grid-cols-3"
      >
        <h2 className="text-xl font-bold tracking-[-0.01em] lg:col-span-3" id="method-heading">
          How a station gets updated
        </h2>
        <Rule
          icon="check_circle"
          text="An MTA, New York State, or NYC government page says the station is now accessible. These update the station right away."
          title="Official release"
        />
        <Rule
          icon="news"
          text="A recognized NYC outlet such as amNY, Gothamist, NY1, or News 12 reports the opening. Stories from unknown sites wait for confirmation."
          title="News story"
        />
        <Rule
          icon="groups"
          text="Reddit posts count through the MTA or news link they share. Photo-only posts need a second independent post before the station changes."
          title="Reddit with proof"
        />
        <p className="text-sm text-[var(--muted)] lg:col-span-3">
          Station names that match more than one line are never guessed. Spotted a mistake?
          Add the link to <code className="font-mono">data/accessibility-news-review.json</code> in
          the project repository and the next check will ignore it.
        </p>
      </section>
    </div>
  );
}

function stationHref(opening: StationOpening) {
  const row = stations.find(
    (station) =>
      station.station === opening.station &&
      station.services.map(String).join("/") === opening.services.join("/"),
  );
  return row ? `/stations/${getStationSlug(row)}` : null;
}

function SourceStatus({
  checkedAt,
  sources,
}: {
  checkedAt: string | null;
  sources: ReturnType<typeof getAccessibilityNews>["sources"];
}) {
  if (!checkedAt || sources.length === 0) {
    return (
      <p className="mt-5 text-[15px] text-[var(--muted)]">
        Sources haven&apos;t been checked yet. The first check runs automatically.
      </p>
    );
  }

  return (
    <ul aria-label="Source status" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
      {sources.map((source) => (
        <li className="inline-flex items-center gap-2" key={source.kind}>
          <span
            aria-hidden="true"
            className={[
              "h-2.5 w-2.5 rounded-full",
              source.status === "ok" ? "bg-[var(--route-green)]" : "bg-[var(--route-orange)]",
            ].join(" ")}
          />
          <span className="font-semibold text-[var(--ink)]">{source.name}</span>
          <span className="text-[var(--muted)]">
            {source.status === "ok"
              ? `checked ${formatRelative(source.checkedAt)}`
              : `unreachable, last worked ${formatRelative(source.lastSuccessAt)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PendingRow({
  detail,
  href,
  meta,
  title,
}: {
  detail: string;
  href?: string | null;
  meta: string;
  title: string;
}) {
  return (
    <li className="flex gap-4 py-4">
      <span
        aria-hidden="true"
        className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--status-partial)]"
      />
      <div className="min-w-0">
        {href ? (
          <a
            className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {title}
          </a>
        ) : (
          <p className="font-semibold">{title}</p>
        )}
        <p className="mt-0.5 text-sm text-[var(--muted)]">{meta}</p>
        <p className="mt-1 text-[15px] text-[var(--muted-strong)]">{detail}</p>
      </div>
    </li>
  );
}

function Rule({ icon, text, title }: { icon: string; text: string; title: string }) {
  return (
    <div>
      <h3 className="inline-flex items-center gap-2 font-bold">
        <SiteIcon className="text-[19px] text-[var(--accent-600)]" name={icon} />
        {title}
      </h3>
      <p className="mt-1.5 text-[15px] leading-6 text-[var(--muted-strong)]">{text}</p>
    </div>
  );
}
