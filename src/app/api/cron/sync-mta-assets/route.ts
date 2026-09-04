import { NextResponse } from "next/server";
import { syncMtaAssetsToPostgres } from "@/lib/mta-assets";
import { syncMtaCapitalProjectsToPostgres } from "@/lib/mta-capital-projects";

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
    const [assetResult, capitalResult] = await Promise.allSettled([
      syncMtaAssetsToPostgres(),
      syncMtaCapitalProjectsToPostgres(),
    ]);

    if (assetResult.status === "rejected" || capitalResult.status === "rejected") {
      return NextResponse.json(
        {
          error: "One or more daily MTA datasets failed to synchronize.",
          assets:
            assetResult.status === "fulfilled"
              ? { ok: true, loadedRowCount: assetResult.value.loadedRowCount }
              : { ok: false, error: describeError(assetResult.reason) },
          capitalProjects:
            capitalResult.status === "fulfilled"
              ? { ok: true, projectCount: capitalResult.value.projectCount }
              : { ok: false, error: describeError(capitalResult.reason) },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      assets: {
        datasetId: assetResult.value.metadata.datasetId,
        loadedRowCount: assetResult.value.loadedRowCount,
        rowCountMatches: assetResult.value.rowCountMatches,
        syncedAt: assetResult.value.metadata.lastSyncedAt,
      },
      capitalProjects: capitalResult.value,
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

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
