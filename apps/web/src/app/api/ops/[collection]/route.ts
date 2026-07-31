import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { ensureDb } from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";

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
  | "xpBans"
  | "helpers"
  | "qotd"
  | "certRotation"
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
    | "XpBan"
    | "HelperRole"
    | "QotdRotation"
    | "CertRotation"
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
  xpBans: "XpBan",
  helpers: "HelperRole",
  qotd: "QotdRotation",
  certRotation: "CertRotation",
  users: "User",
  polls: "Poll",
};

function getModel(db: DbModels, collection: string): AnyModel | null {
  const key = MODEL_MAP[collection as CollectionKey];
  if (!key) return null;
  return db[key] as unknown as AnyModel;
}

const SORT_ALLOWLIST: Partial<Record<CollectionKey, string[]>> = {
  users: ["xp", "total_messages", "createdAt", "_id"],
  xpBans: ["userId", "reason", "createdAt", "_id"],
};

const DEFAULT_SORT: Record<string, 1 | -1> = {
  createdAt: -1,
  timestamp: -1,
  _id: -1,
};

function parseOptionalNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSort(
  collection: string,
  sortParam: string | null,
  orderParam: string | null,
): Record<string, 1 | -1> {
  const allowlist = SORT_ALLOWLIST[collection as CollectionKey];
  if (!allowlist || !sortParam || !allowlist.includes(sortParam)) {
    return DEFAULT_SORT;
  }
  const dir = orderParam === "asc" ? 1 : -1;
  return { [sortParam]: dir };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ collection: string }> },
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
    const sort = buildSort(
      collection,
      searchParams.get("sort"),
      searchParams.get("order"),
    );
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

    if (collection === "users") {
      const xpMin = parseOptionalNumber(searchParams.get("xpMin"));
      const xpMax = parseOptionalNumber(searchParams.get("xpMax"));
      const messagesMin = parseOptionalNumber(searchParams.get("messagesMin"));
      const messagesMax = parseOptionalNumber(searchParams.get("messagesMax"));

      if (xpMin !== null || xpMax !== null) {
        const xpFilter: Record<string, number> = {};
        if (xpMin !== null) xpFilter.$gte = xpMin;
        if (xpMax !== null) xpFilter.$lte = xpMax;
        filter.xp = xpFilter;
      }
      if (messagesMin !== null || messagesMax !== null) {
        const messagesFilter: Record<string, number> = {};
        if (messagesMin !== null) messagesFilter.$gte = messagesMin;
        if (messagesMax !== null) messagesFilter.$lte = messagesMax;
        filter.total_messages = messagesFilter;
      }
    }

    const [items, total] = await Promise.all([
      Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
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
