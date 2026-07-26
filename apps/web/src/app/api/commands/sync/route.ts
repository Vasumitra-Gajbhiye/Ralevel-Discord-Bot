import { NextResponse } from "next/server";
import { requireAllowlistedAuth } from "@/lib/auth";
import { syncCommandsToDiscord } from "@/lib/discordSync";

export const dynamic = "force-dynamic";

export async function POST() {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authResult.status },
    );
  }

  try {
    const result = await syncCommandsToDiscord();

    return NextResponse.json({
      ok: true,
      commandCount: result.commandCount,
    });
  } catch (err) {
    console.error("[POST /api/commands/sync]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to sync commands to Discord",
      },
      { status: 500 },
    );
  }
}
