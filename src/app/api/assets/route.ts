import { NextResponse } from "next/server";
import { getMtaAssetDataset } from "@/lib/mta-assets";

export async function GET() {
  try {
    const dataset = await getMtaAssetDataset();

    return NextResponse.json({
      assets: dataset.assets,
      columns: dataset.columns,
      metadata: dataset.metadata,
      stats: dataset.stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load assets",
      },
      { status: 502 },
    );
  }
}
