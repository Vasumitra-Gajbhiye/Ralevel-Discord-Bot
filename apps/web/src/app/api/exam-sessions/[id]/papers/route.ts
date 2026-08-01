import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowlistedAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { computePaperWindow } from "@ralevel/db";

export const dynamic = "force-dynamic";

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "Invalid channel ID");

const createPaperSchema = z.object({
  label: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  slot: z.enum(["AM", "PM"]),
  channelIds: z.array(snowflakeSchema).min(1),
});

function unauthorized(authResult: { status: 401 | 403 }) {
  return NextResponse.json(
    { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: authResult.status },
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = createPaperSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { ExamSession, ExamPaper } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const sessionDoc = await ExamSession.findOne({ _id: id, guildId }).lean();
    if (!sessionDoc || Array.isArray(sessionDoc)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionDoc as unknown as {
      amStartUtc: string;
      amEndUtc: string;
      pmStartUtc: string;
      pmEndUtc: string;
    };

    const uniqueChannelIds = [...new Set(parsed.data.channelIds)];
    const { lockAt, unlockAt } = computePaperWindow(session, {
      date: parsed.data.date,
      slot: parsed.data.slot,
    });

    const paper = await ExamPaper.create({
      sessionId: id,
      guildId,
      label: parsed.data.label,
      date: parsed.data.date,
      slot: parsed.data.slot,
      channelIds: uniqueChannelIds,
      lockAt,
      unlockAt,
      status: "scheduled",
    });

    return NextResponse.json({ paper }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/exam-sessions/[id]/papers]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create paper",
      },
      { status: 500 },
    );
  }
}
