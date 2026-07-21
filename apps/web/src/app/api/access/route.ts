import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth";
import {
  ensureSeedAllowlist,
  listAccessEntries,
  upsertAccessLabel,
} from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSeedAllowlist();
    const entries = await listAccessEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[GET /api/access]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load access list",
      },
      { status: 500 },
    );
  }
}

const addAccessSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = addAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const name = parsed.data.name?.trim() ?? "";
    const existing = await listAccessEntries();
    if (existing.some((entry) => entry.email === email)) {
      return NextResponse.json(
        { error: "Email is already on the allowlist" },
        { status: 409 },
      );
    }

    const client = await clerkClient();
    const created = await client.allowlistIdentifiers.createAllowlistIdentifier({
      identifier: email,
      notify: false,
    });
    await upsertAccessLabel(email, name);

    return NextResponse.json({
      entry: {
        id: created.id,
        email: created.identifier,
        name,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    console.error("[POST /api/access]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add email" },
      { status: 500 },
    );
  }
}
