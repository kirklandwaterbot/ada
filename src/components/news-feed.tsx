"use client";

import { useMemo, useState } from "react";
import { SiteIcon } from "@/components/site-icon";
import type { NewsFeedItem, NewsKind } from "@/lib/accessibility-news";

const FILTERS: Array<{ label: string; value: "all" | "openings" | NewsKind }> = [
  { label: "Everything", value: "all" },
  { label: "Openings", value: "openings" },
  { label: "MTA", value: "mta" },
  { label: "News", value: "news" },
  { label: "Reddit", value: "reddit" },
];

const STATUS_TEXT: Record<NewsFeedItem["status"], string | null> = {
  "already-accessible": "Station already accessible",
  "needs-review": "Needs a second source",
  news: null,
  rejected: "Rejected",
  verified: "Station updated",
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "America/New_York",
});

export function NewsFeed({ items }: { items: NewsFeedItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const visible = useMemo(
    () =>
      items.filter((item) =>
        filter === "all" ? true : filter === "openings" ? item.opening : item.kind === filter,
      ),
    [filter, items],
  );

  return (
    <div>
      <div aria-label="Filter coverage" className="flex flex-wrap gap-2" role="group">
        {FILTERS.map((option) => {
          const count =
            option.value === "all"
              ? items.length
              : option.value === "openings"
                ? items.filter((item) => item.opening).length
                : items.filter((item) => item.kind === option.value).length;
          return (
            <button
              aria-pressed={filter === option.value}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-[15px] font-semibold transition-colors",
                filter === option.value
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--app-bg)]"
                  : "border-[var(--border-strong)] text-[var(--muted-strong)] hover:border-[var(--ink)] hover:text-[var(--ink)]",
              ].join(" ")}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
              <span className="text-[13px] tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-[var(--muted-strong)]">
          Nothing from this source yet. The next check runs within three hours.
        </p>
      ) : (
        <ol className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {visible.map((item) => {
            const statusText = STATUS_TEXT[item.status];
            return (
              <li className="grid gap-x-5 gap-y-1 py-4 sm:grid-cols-[5.5rem_1fr]" key={item.id}>
                <time
                  className="text-sm tabular-nums text-[var(--muted)] sm:pt-0.5"
                  dateTime={item.publishedAt}
                >
                  {dateFormat.format(new Date(item.publishedAt))}
                </time>
                <div className="min-w-0">
                  <a
                    className="font-semibold leading-snug text-[var(--ink)] underline-offset-4 hover:underline"
                    href={item.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <SiteIcon
                        className="text-[15px]"
                        name={item.kind === "reddit" ? "groups" : item.kind === "mta" ? "check_circle" : "news"}
                      />
                      {item.source}
                    </span>
                    {item.stations.length > 0 ? (
                      <span>{item.stations.map((station) => station.station).join(", ")}</span>
                    ) : null}
                    {statusText ? (
                      <span
                        className={
                          item.status === "verified"
                            ? "font-semibold text-[var(--status-accessible)]"
                            : item.status === "needs-review"
                              ? "font-semibold text-[var(--status-partial)]"
                              : ""
                        }
                      >
                        {statusText}
                      </span>
                    ) : null}
                    {item.discussionUrl && item.discussionUrl !== item.url ? (
                      <a
                        className="font-semibold text-[var(--accent-600)] underline-offset-4 hover:underline"
                        href={item.discussionUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Discussion
                      </a>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
