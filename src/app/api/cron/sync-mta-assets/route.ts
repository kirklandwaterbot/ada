import { NextResponse } from "next/server";
import { syncMtaAssetsToPostgres } from "@/lib/mta-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMtaAssetsToPostgres();

    return NextResponse.json({
      ok: true,
      datasetId: result.metadata.datasetId,
      loadedRowCount: result.loadedRowCount,
      rowCountMatches: result.rowCountMatches,
      syncedAt: result.metadata.lastSyncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to sync MTA assets.",
      },
      { status: 502 },
    );
  }
}
