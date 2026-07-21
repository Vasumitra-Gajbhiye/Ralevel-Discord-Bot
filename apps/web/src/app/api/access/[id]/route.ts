import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth";
import {
  deleteAccessLabel,
  findAccessEntryById,
  upsertAccessLabel,
} from "@/lib/access";

export const dynamic = "force-dynamic";

const updateNameSchema = z.object({
  name: z.string().trim().max(120),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entry = await findAccessEntryById(id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateNameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid name" },
        { status: 400 },
      );
    }

    await upsertAccessLabel(entry.email, parsed.data.name);

    return NextResponse.json({
      entry: {
        ...entry,
        name: parsed.data.name,
      },
    });
  } catch (err) {
    console.error("[PATCH /api/access/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update name" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entry = await findAccessEntryById(id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await currentUser();
    const currentEmail =
      user?.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      )?.emailAddress?.toLowerCase() ??
      user?.emailAddresses[0]?.emailAddress?.toLowerCase() ??
      null;

    if (currentEmail && entry.email.toLowerCase() === currentEmail) {
      return NextResponse.json(
        { error: "You cannot remove your own email from the allowlist" },
        { status: 400 },
      );
    }

    const client = await clerkClient();
    await client.allowlistIdentifiers.deleteAllowlistIdentifier(id);
    await deleteAccessLabel(entry.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/access/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove email" },
      { status: 500 },
    );
  }
}
