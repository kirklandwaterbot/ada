import { MapFirstHome } from "@/components/map-first-home";
import { getMtaAssetDataset } from "@/lib/mta-assets";
import {
  formatMtaPressReleaseDate,
  getLatestMtaAccessibilityPressRelease,
} from "@/lib/mta-press-releases";
import { createStationExplorerData } from "@/lib/station-explorer-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [dataset, pressRelease] = await Promise.all([
    getMtaAssetDataset().catch(() => null),
    getLatestMtaAccessibilityPressRelease(),
  ]);

  const { mapAssets, stationRecords } = createStationExplorerData(
    dataset?.assets ?? [],
  );

  return (
    <MapFirstHome
      mapAssets={mapAssets}
      pressRelease={{
        formattedDate: formatMtaPressReleaseDate(pressRelease.publishedAt),
        title: pressRelease.title,
        url: pressRelease.url,
      }}
      stationRecords={stationRecords}
    />
  );
}
