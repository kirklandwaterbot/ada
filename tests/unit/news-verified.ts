import accessibilityNews from "../../data/accessibility-news.json";

type NewsOpening = {
  applied?: boolean;
  resultingStatus: string;
  services: string[];
  station: string;
};

/**
 * The accessibility news auto-updater can legitimately change the checked-in
 * snapshot (e.g. a partially accessible station becoming fully accessible).
 * Snapshot tests use this to accept either the curated state or the
 * news-verified state, but never anything else.
 */
export function newsVerifiedOpening(station: string, services: string[]) {
  return (accessibilityNews.openings as unknown as NewsOpening[]).find(
    (opening) =>
      opening.applied === true &&
      opening.resultingStatus === "Accessible" &&
      opening.station === station &&
      opening.services.some((service) => services.includes(service)),
  );
}

export const NEWS_SYNC_MARKER = "accessibility-news-sync";
