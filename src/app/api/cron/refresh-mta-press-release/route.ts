import { NextResponse } from "next/server";
import { refreshLatestMtaAccessibilityPressRelease } from "@/lib/mta-press-releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const release = await refreshLatestMtaAccessibilityPressRelease();

    if (!release) {
      throw new Error("No matching MTA accessibility press release was found.");
    }

    return NextResponse.json({
      imageUrl: release.imageUrl,
      ok: true,
      publishedAt: release.publishedAt,
      refreshedAt: new Date().toISOString(),
      title: release.title,
      url: release.url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh the MTA project spotlight.",
      },
      { status: 502 },
    );
  }
}
