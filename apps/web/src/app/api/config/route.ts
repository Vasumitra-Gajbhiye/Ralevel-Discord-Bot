import { NextResponse } from "next/server";
import {
  getOrCreateGuildConfig,
  guildConfigToJson,
} from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const doc = await getOrCreateGuildConfig();
    return NextResponse.json(guildConfigToJson(doc));
  } catch (err) {
    console.error("[GET /api/config]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load config" },
      { status: 500 },
    );
  }
}

const PATCHABLE = [
  "roles",
  "commandPermissions",
  "channels",
  "channelLabels",
  "features",
  "reputation",
  "ranks",
  "schedules",
  "welcome",
  "certificates",
  "confessions",
  "tasks",
  "polls",
  "sticky",
  "helper",
] as const;

export async function PUT(request: Request) {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const doc = await getOrCreateGuildConfig();

    for (const key of PATCHABLE) {
      if (body[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (doc as any)[key] = body[key];
        if (key === "commandPermissions") {
          doc.markModified("commandPermissions");
        }
      }
    }

    await doc.save();
    return NextResponse.json(guildConfigToJson(doc));
  } catch (err) {
    console.error("[PUT /api/config]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save config" },
      { status: 500 },
    );
  }
}
