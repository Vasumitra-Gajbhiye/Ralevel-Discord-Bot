import { NextResponse } from "next/server";
import { requireAllowlistedAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The guild's live channel list, as last published by the bot
 * (ChannelDirectory). `updatedAt` is null until the bot has published once.
 */
export async function GET() {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authResult.status },
    );
  }

  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const { ChannelDirectory } = await ensureDb();
    const doc = await ChannelDirectory.findOne({ guildId }).lean<{
      channels?: unknown[];
      updatedAt?: Date;
    }>();

    return NextResponse.json({
      channels: doc?.channels ?? [],
      updatedAt: doc?.updatedAt ?? null,
    });
  } catch (err) {
    console.error("[GET /api/discord/channels]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load channels" },
      { status: 500 },
    );
  }
}
