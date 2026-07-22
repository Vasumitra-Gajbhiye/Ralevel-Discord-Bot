import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { ensureDb } from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";

type DbModels = Awaited<ReturnType<typeof ensureDb>>;
type AnyModel = Model<Record<string, unknown>>;

const MODEL_MAP: Record<string, keyof DbModels> = {
  warnings: "Warning",
  notes: "Note",
  modlogs: "ModLog",
  certificates: "Certificate",
  tasks: "Task",
  stickies: "Sticky",
  stickyLogs: "StickyLog",
  confessions: "Confession",
  confessionBans: "ConfessionBan",
  reputation: "Reputation",
  repBans: "RepBan",
  helpers: "HelperRole",
  qotd: "QotdRotation",
  users: "User",
  polls: "Poll",
};

function getModel(db: DbModels, collection: string): AnyModel | null {
  const key = MODEL_MAP[collection];
  if (!key || !db[key]) return null;
  return db[key as keyof DbModels] as unknown as AnyModel;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
) {
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
    const { collection, id } = await context.params;
    const db = await ensureDb();
    const Model = getModel(db, collection);
    if (!Model) {
      return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    }
    const body = await request.json();
    delete body._id;

    // User model uses string _id
    const updated = await Model.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/ops]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
) {
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
    const { collection, id } = await context.params;
    const db = await ensureDb();
    const Model = getModel(db, collection);
    if (!Model) {
      return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    }
    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/ops]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
