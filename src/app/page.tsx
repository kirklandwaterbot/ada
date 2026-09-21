import { MapFirstHome } from "@/components/map-first-home";
import { PageHeader } from "@/components/page-header";
import { formatTimestamp, getMtaAssetDataset } from "@/lib/mta-assets";
import {
  formatMtaPressReleaseDate,
  getLatestMtaAccessibilityPressRelease,
} from "@/lib/mta-press-releases";
import { createStationExplorerData } from "@/lib/station-explorer-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [datasetResult, pressRelease] = await Promise.all([
    getMtaAssetDataset()
      .then((dataset) => ({ dataset, loadError: null }))
      .catch((error: unknown) => ({
        dataset: null,
        loadError:
          error instanceof Error
            ? error.message
            : "Unable to load MTA asset data.",
      })),
    getLatestMtaAccessibilityPressRelease(),
  ]);
  const { dataset, loadError } = datasetResult;

  if (!dataset || loadError) {
    return (
      <div className="page-enter p-5 sm:p-8">
        <PageHeader
          description="The station workbook is available, but the synchronized equipment inventory could not be loaded."
          eyebrow="System map"
          title="Accessibility map unavailable"
        />
        <div className="surface-card mt-8 border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {loadError ?? "Unable to load equipment data."}
        </div>
      </div>
    );
  }

  const { mapAssets, stationRecords } = createStationExplorerData(dataset.assets);

  return (
    <MapFirstHome
      mapAssets={mapAssets}
      pressRelease={{
        formattedDate: formatMtaPressReleaseDate(pressRelease.publishedAt),
        title: pressRelease.title,
        url: pressRelease.url,
      }}
      stationRecords={stationRecords}
      updatedAt={formatTimestamp(dataset.metadata.lastSyncedAt)}
    />
  );
}
