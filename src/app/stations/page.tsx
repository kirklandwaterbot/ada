import type { Metadata } from "next";
import { DataHealthNotice } from "@/components/data-health-notice";
import { PageHeader } from "@/components/page-header";
import {
  StationExplorer,
  type ExploreWorkspaceView,
} from "@/components/station-explorer";
import { getMtaAssetDataset } from "@/lib/mta-assets";
import { createStationExplorerData } from "@/lib/station-explorer-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore stations and the system map",
  description:
    "Search NYC subway stations and inspect accessibility, equipment, and planned work on one interactive map.",
};

export default async function StationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = (await searchParams).view;
  const requestedView = Array.isArray(view) ? view[0] : view;
  const initialView: ExploreWorkspaceView | undefined =
    requestedView === "explorer" ||
    requestedView === "map" ||
    requestedView === "split"
      ? requestedView
      : undefined;
  const dataset = await getMtaAssetDataset();
  const explorerData = createStationExplorerData(dataset.assets);

  return (
    <div className="page-enter space-y-7">
      <PageHeader
        description="Search and filter stations beside the accessibility map, or switch to a full-width explorer or map whenever you need more room."
        eyebrow="System explorer"
        title="Explore stations and accessibility"
      />
      <DataHealthNotice metadata={dataset.metadata} />
      <StationExplorer
        initialView={initialView}
        mapAssets={explorerData.mapAssets}
        stationRecords={explorerData.stationRecords}
      />
    </div>
  );
}
