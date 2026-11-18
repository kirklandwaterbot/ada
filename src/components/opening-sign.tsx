import Link from "next/link";
import { SiteIcon } from "@/components/site-icon";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import {
  formatNewsDate,
  type NewsEvidence,
  type StationOpening,
  VERIFICATION_LABELS,
} from "@/lib/accessibility-news";

const KIND_ICON: Record<NewsEvidence["kind"], string> = {
  mta: "check_circle",
  news: "news",
  reddit: "groups",
};

/**
 * A newly accessible station, drawn as a subway station sign with the
 * sources that prove it hanging underneath.
 */
export function OpeningSign({
  index = 0,
  opening,
  stationHref,
}: {
  index?: number;
  opening: StationOpening;
  stationHref: string | null;
}) {
  const full = opening.resultingStatus === "Accessible";

  return (
    <article
      className="sign-flip scroll-mt-24"
      id={opening.key}
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
    >
      <div className="sign-plate flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-4 pt-6 sm:px-6">
        <h3 className="text-[1.6rem] font-bold leading-tight tracking-[-0.01em] sm:text-[1.9rem]">
          {opening.station}
        </h3>
        <SubwayRouteIcons
          className="[&_img]:h-7 [&_img]:w-7"
          routes={opening.services}
        />
        <p className="ml-auto text-[15px] font-semibold text-white/80">
          <time dateTime={opening.openedAt}>{formatNewsDate(opening.openedAt)}</time>
        </p>
      </div>

      <div className="rounded-b-[var(--radius-plate)] border border-t-0 border-[var(--border)] bg-[var(--panel)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[var(--status-accessible)]">
            <SiteIcon className="text-[18px]" name="accessible" />
            {full ? "Fully accessible" : "Partially accessible"}
          </p>
          <p className="text-[15px] text-[var(--muted-strong)]">
            {VERIFICATION_LABELS[opening.verification]}
            {opening.applied ? "" : " (pending)"}
          </p>
          {stationHref ? (
            <Link
              className="ml-auto text-[15px] font-semibold text-[var(--accent-600)] underline-offset-4 hover:underline"
              href={stationHref}
            >
              Station details
            </Link>
          ) : null}
        </div>

        <ul aria-label={`Sources for ${opening.station}`} className="mt-3 flex flex-col gap-2">
          {opening.evidence.slice(0, 4).map((evidence) => (
            <li key={evidence.id}>
              <a
                className="group flex items-start gap-3 rounded-md border border-[var(--border)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--soft)]"
                href={evidence.url}
                rel="noreferrer"
                target="_blank"
              >
                <SiteIcon
                  className="mt-0.5 text-[18px] text-[var(--muted)]"
                  name={KIND_ICON[evidence.kind]}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--ink)] group-hover:underline">
                    {evidence.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--muted)]">
                    {evidence.source}, {formatNewsDate(evidence.publishedAt)}
                  </span>
                </span>
                <SiteIcon className="mt-1 text-[15px] text-[var(--muted)]" name="open_in_new" />
              </a>
              {evidence.discussionUrl && evidence.discussionUrl !== evidence.url ? (
                <a
                  className="ml-10 mt-1 inline-block text-sm font-semibold text-[var(--accent-600)] underline-offset-4 hover:underline"
                  href={evidence.discussionUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Reddit discussion
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
