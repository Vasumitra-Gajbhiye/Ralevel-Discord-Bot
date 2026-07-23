import { NextResponse } from "next/server";
import {
  getOrCreateGuildConfig,
  guildConfigToJson,
} from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";
import { normalizeReputationIdLabels } from "@ralevel/db";

export const dynamic = "force-dynamic";

export async function GET() {
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
  "categories",
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
    const body = await request.json();
    const doc = await getOrCreateGuildConfig();

    for (const key of PATCHABLE) {
      if (body[key] !== undefined) {
        const value =
          key === "reputation"
            ? normalizeReputationIdLabels(body.reputation)
            : body[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (doc as any)[key] = value;
        if (key === "commandPermissions" || key === "reputation") {
          doc.markModified(key);
        }
      }
    }

    if (doc.reputation) {
      doc.reputation = normalizeReputationIdLabels(doc.reputation);
      doc.markModified("reputation");
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
