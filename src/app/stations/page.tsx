import type { Metadata } from "next";
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
    "Search subway, PATH, AirTrain, commuter rail, light rail, and CTrail stations and inspect accessibility on one interactive map.",
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
  const dataset = await getMtaAssetDataset().catch(() => null);
  const explorerData = createStationExplorerData(dataset?.assets ?? []);

  return (
    <div className="page-enter space-y-7">
      <PageHeader
        description="Search and filter NYCTA, PATH, AirTrain, LIRR, Metro-North, NJ Transit, and CTrail stations beside the accessibility map."
        eyebrow="System explorer"
        title="Explore stations and accessibility"
      />
      <StationExplorer
        initialView={initialView}
        mapAssets={explorerData.mapAssets}
        stationRecords={explorerData.stationRecords}
      />
    </div>
  );
}
