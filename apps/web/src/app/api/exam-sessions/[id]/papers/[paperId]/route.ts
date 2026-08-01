import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowlistedAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { computePaperWindow } from "@ralevel/db";

export const dynamic = "force-dynamic";

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "Invalid channel ID");

const patchPaperSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  slot: z.enum(["AM", "PM"]).optional(),
  channelIds: z.array(snowflakeSchema).min(1).optional(),
  action: z.enum(["cancel", "force-unlock"]).optional(),
});

function unauthorized(authResult: { status: 401 | 403 }) {
  return NextResponse.json(
    { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: authResult.status },
  );
}

type RouteContext = {
  params: Promise<{ id: string; paperId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id, paperId } = await context.params;
    const body = await request.json();
    const parsed = patchPaperSchema.safeParse(body);
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

    const paper = await ExamPaper.findOne({
      _id: paperId,
      sessionId: id,
      guildId,
    });
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    if (parsed.data.action === "cancel") {
      if (paper.status === "cancelled" || paper.status === "unlocked") {
        return NextResponse.json(
          { error: `Paper is already ${paper.status}` },
          { status: 409 },
        );
      }
      if (paper.status === "scheduled") {
        paper.status = "cancelled";
        await paper.save();
        return NextResponse.json({ paper });
      }
      // locked → request unlock, then cancel
      paper.forceUnlock = true;
      paper.cancelAfterUnlock = true;
      await paper.save();
      return NextResponse.json({ paper });
    }

    if (parsed.data.action === "force-unlock") {
      if (paper.status !== "locked") {
        return NextResponse.json(
          { error: "Only locked papers can be force-unlocked" },
          { status: 409 },
        );
      }
      paper.forceUnlock = true;
      await paper.save();
      return NextResponse.json({ paper });
    }

    if (paper.status !== "scheduled") {
      return NextResponse.json(
        { error: "Only scheduled papers can be edited" },
        { status: 409 },
      );
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

    if (parsed.data.label !== undefined) paper.label = parsed.data.label;
    if (parsed.data.date !== undefined) paper.date = parsed.data.date;
    if (parsed.data.slot !== undefined) paper.slot = parsed.data.slot;
    if (parsed.data.channelIds !== undefined) {
      paper.channelIds = [...new Set(parsed.data.channelIds)];
    }

    const { lockAt, unlockAt } = computePaperWindow(session, {
      date: paper.date,
      slot: paper.slot,
    });
    paper.lockAt = lockAt;
    paper.unlockAt = unlockAt;
    await paper.save();

    return NextResponse.json({ paper });
  } catch (err) {
    console.error("[PATCH /api/exam-sessions/[id]/papers/[paperId]]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update paper",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id, paperId } = await context.params;
    const { ExamPaper } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const paper = await ExamPaper.findOne({
      _id: paperId,
      sessionId: id,
      guildId,
    });
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    if (paper.status === "locked") {
      return NextResponse.json(
        {
          error:
            "Cannot delete a locked paper. Force-unlock or cancel it first.",
        },
        { status: 409 },
      );
    }

    await paper.deleteOne();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/exam-sessions/[id]/papers/[paperId]]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to delete paper",
      },
      { status: 500 },
    );
  }
}
