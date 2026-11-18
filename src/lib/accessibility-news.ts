import accessibilityNews from "../../data/accessibility-news.json";

export type NewsTier = "official" | "news" | "community" | "unverified";
export type NewsKind = "mta" | "news" | "reddit" | "equipment";
export type NewsItemStatus =
  | "verified"
  | "needs-review"
  | "already-accessible"
  | "news"
  | "rejected";

export type NewsStationRef = {
  line: string;
  services: string[];
  slug: string;
  station: string;
};

export type EquipmentUnit = {
  ada: boolean;
  code: string;
  kind: "Elevator" | "Escalator" | string;
  notes: string;
};

export type NewsFeedItem = {
  discussionUrl: string | null;
  /** Units behind an MTA elevator & escalator data item. */
  equipment?: EquipmentUnit[];
  /** Whether the article behind a vague headline could be read. */
  glimpse?: "found" | "unavailable";
  glimpsedAt?: string;
  id: string;
  kind: NewsKind;
  opening: boolean;
  partial: boolean;
  proofUrls: string[];
  publishedAt: string;
  reason: string;
  source: string;
  stations: NewsStationRef[];
  /** The station came from the article text, not the headline. */
  stationsFromArticle?: boolean;
  status: NewsItemStatus;
  subject: boolean;
  /** MTA headline that reads like an opening but couldn't be confirmed. */
  tentative?: boolean;
  tier: NewsTier;
  title: string;
  url: string;
};

export type NewsEvidence = {
  discussionUrl: string | null;
  id: string;
  kind: NewsKind;
  partial: boolean;
  publishedAt: string;
  source: string;
  tier: NewsTier;
  title: string;
  url: string;
};

export type StationOpening = NewsStationRef & {
  applied: boolean;
  appliedAt?: string;
  evidence: NewsEvidence[];
  key: string;
  openedAt: string;
  primarySource: { source: string; title: string; url: string } | null;
  readyToApply: boolean;
  resultingStatus: "Accessible" | "Partially accessible";
  verification: "official" | "news" | "community";
};

export type NewsSource = {
  checkedAt: string;
  error?: string;
  itemCount: number;
  kind: string;
  lastSuccessAt?: string | null;
  mode?: string;
  name: string;
  status: "ok" | "failed";
};

export type AccessibilityNewsFile = {
  checkedAt: string | null;
  feed: NewsFeedItem[];
  methodology: string;
  openings: StationOpening[];
  sources: NewsSource[];
  version: number;
};

const data = accessibilityNews as unknown as AccessibilityNewsFile;

export function getAccessibilityNews(): AccessibilityNewsFile {
  return data;
}

/** Openings that changed (or confirmed) a station's status, newest first. */
export function getVerifiedOpenings() {
  return data.openings.filter((opening) => opening.readyToApply);
}

export function getOpeningsAwaitingReview() {
  return data.openings.filter((opening) => !opening.readyToApply);
}

export function getOpeningForStation(station: string, services: string[]) {
  return data.openings.find(
    (opening) =>
      opening.readyToApply &&
      opening.station === station &&
      opening.services.some((service) => services.includes(service)),
  );
}

export function getRecentOpeningCount(days = 45, now = Date.now()) {
  return getVerifiedOpenings().filter(
    (opening) => now - Date.parse(opening.openedAt) <= days * 864e5,
  ).length;
}

export function getLatestVerifiedOpening() {
  return getVerifiedOpenings()[0] ?? null;
}

export const TIER_LABELS: Record<NewsTier, string> = {
  community: "Community photo",
  news: "News report",
  official: "Official",
  unverified: "Unverified",
};

export const VERIFICATION_LABELS: Record<StationOpening["verification"], string> = {
  community: "Community reports",
  news: "Confirmed by news coverage",
  official: "Confirmed by the MTA",
};

export function formatNewsDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "America/New_York",
    year: "numeric",
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined, now = Date.now()) {
  if (!value) return "not yet";
  const diff = now - Date.parse(value);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} days ago`;
  return formatNewsDate(value);
}
