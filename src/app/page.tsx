import { MapFirstHome } from "@/components/map-first-home";
import {
  formatNewsDate,
  getLatestVerifiedOpening,
  getRecentOpeningCount,
} from "@/lib/accessibility-news";
import { getMtaAssetDataset } from "@/lib/mta-assets";
import { createStationExplorerData } from "@/lib/station-explorer-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dataset = await getMtaAssetDataset().catch(() => null);
  const { mapAssets, stationRecords } = createStationExplorerData(
    dataset?.assets ?? [],
  );
  const opening = getLatestVerifiedOpening();
  // Only surface an opening on the map while it is still news.
  const recentOpeningCount = getRecentOpeningCount();

  return (
    <MapFirstHome
      latestOpening={
        opening && recentOpeningCount > 0
          ? {
              formattedDate: formatNewsDate(opening.openedAt),
              href: `/updates#${encodeURIComponent(opening.key)}`,
              services: opening.services,
              source: opening.primarySource?.source ?? "",
              station: opening.station,
            }
          : null
      }
      mapAssets={mapAssets}
      recentOpeningCount={recentOpeningCount}
      stationRecords={stationRecords}
    />
  );
}
