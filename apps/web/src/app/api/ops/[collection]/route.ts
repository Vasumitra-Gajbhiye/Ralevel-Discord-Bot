import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { ensureDb } from "@/lib/db";

type DbModels = Awaited<ReturnType<typeof ensureDb>>;
type AnyModel = Model<Record<string, unknown>>;

type CollectionKey =
  | "warnings"
  | "notes"
  | "modlogs"
  | "certificates"
  | "tasks"
  | "stickies"
  | "stickyLogs"
  | "confessions"
  | "confessionBans"
  | "reputation"
  | "repBans"
  | "helpers"
  | "qotd"
  | "users"
  | "polls";

const MODEL_MAP: Record<
  CollectionKey,
  keyof Pick<
    DbModels,
    | "Warning"
    | "Note"
    | "ModLog"
    | "Certificate"
    | "Task"
    | "Sticky"
    | "StickyLog"
    | "Confession"
    | "ConfessionBan"
    | "Reputation"
    | "RepBan"
    | "HelperRole"
    | "QotdRotation"
    | "User"
    | "Poll"
  >
> = {
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
  const key = MODEL_MAP[collection as CollectionKey];
  if (!key) return null;
  return db[key] as unknown as AnyModel;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ collection: string }> },
) {
  try {
    const { collection } = await context.params;
    const db = await ensureDb();
    const Model = getModel(db, collection);
    if (!Model) {
      return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
    const skip = Number(searchParams.get("skip") || 0);
    const q = searchParams.get("q");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const filter: Record<string, unknown> = {};

    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (q) {
      if (collection === "users") {
        filter._id = { $regex: q, $options: "i" };
      } else if (collection === "confessions") {
        filter.$or = [
          { authorId: { $regex: q, $options: "i" } },
          { content: { $regex: q, $options: "i" } },
        ];
      } else {
        filter.$or = [
          { userId: { $regex: q, $options: "i" } },
          { userTag: { $regex: q, $options: "i" } },
          { reason: { $regex: q, $options: "i" } },
          { title: { $regex: q, $options: "i" } },
          { content: { $regex: q, $options: "i" } },
          { question: { $regex: q, $options: "i" } },
          { taskId: { $regex: q, $options: "i" } },
          { actionId: { $regex: q, $options: "i" } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      Model.find(filter)
        .sort({ createdAt: -1, timestamp: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Model.countDocuments(filter),
    ]);

    return NextResponse.json({ items, total });
  } catch (err) {
    console.error("[GET /api/ops]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ collection: string }> },
) {
  try {
    const { collection } = await context.params;
    const db = await ensureDb();
    const Model = getModel(db, collection);
    if (!Model) {
      return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    }
    const body = await request.json();
    const created = await Model.create(body);
    return NextResponse.json(created);
  } catch (err) {
    console.error("[POST /api/ops]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
