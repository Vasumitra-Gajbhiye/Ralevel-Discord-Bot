import { NextResponse } from "next/server";
import { ensureDb, getOrCreateGuildConfig } from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Users ranked by active (not voided, not expired) moderation points. */
export async function GET(request: Request) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) {
    return NextResponse.json(
      {
        error: authResult.status === 401 ? "Unauthorized" : "Forbidden",
      },
      { status: authResult.status },
    );
  }

  try {
    const { ModPoint } = await ensureDb();
    const doc = await getOrCreateGuildConfig();
    const points = doc.moderation?.points ?? {};
    const expiryDays = Number(points.expiryDays) || 0;
    const threshold = Number(points.threshold) || 0;
    const noticeDistance = Number(points.noticeDistance) || 0;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 25), 100);

    const match: Record<string, unknown> = { active: true };
    if (expiryDays > 0) {
      match.createdAt = { $gt: new Date(Date.now() - expiryDays * DAY_MS) };
    }

    const totals = await ModPoint.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          total: { $sum: "$points" },
          entries: { $sum: 1 },
          userTag: { $first: "$userTag" },
          lastAt: { $first: "$createdAt" },
        },
      },
      { $match: { total: { $gt: 0 } } },
      { $sort: { total: -1, lastAt: -1 } },
      { $limit: limit },
    ]);

    return NextResponse.json({
      threshold,
      noticeAt: Math.max(0, threshold - noticeDistance),
      expiryDays,
      items: totals.map((row) => ({
        userId: row._id,
        userTag: row.userTag,
        total: row.total,
        entries: row.entries,
        lastAt: row.lastAt,
      })),
    });
  } catch (err) {
    console.error("[GET /api/mod-points/totals]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
