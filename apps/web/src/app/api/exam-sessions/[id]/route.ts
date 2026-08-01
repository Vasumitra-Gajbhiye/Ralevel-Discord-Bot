import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowlistedAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { computePaperWindow } from "@ralevel/db";

export const dynamic = "force-dynamic";

const timeUtcSchema = z
  .string()
  .transform((v) => v.slice(0, 5))
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm UTC"));

const patchSessionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  amStartUtc: timeUtcSchema.optional(),
  amEndUtc: timeUtcSchema.optional(),
  pmStartUtc: timeUtcSchema.optional(),
  pmEndUtc: timeUtcSchema.optional(),
  status: z.enum(["active", "archived"]).optional(),
});

function unauthorized(authResult: { status: 401 | 403 }) {
  return NextResponse.json(
    { error: authResult.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: authResult.status },
  );
}

function assertSlotOrder(data: {
  amStartUtc: string;
  amEndUtc: string;
  pmStartUtc: string;
  pmEndUtc: string;
}) {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  if (toMinutes(data.amEndUtc) <= toMinutes(data.amStartUtc)) {
    throw new Error("AM end must be after AM start");
  }
  if (toMinutes(data.pmEndUtc) <= toMinutes(data.pmStartUtc)) {
    throw new Error("PM end must be after PM start");
  }
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id } = await context.params;
    const { ExamSession, ExamPaper } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const session = await ExamSession.findOne({ _id: id, guildId }).lean();
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const papers = await ExamPaper.find({ sessionId: id, guildId })
      .sort({ date: 1, slot: 1, label: 1 })
      .lean();

    return NextResponse.json({ session, papers });
  } catch (err) {
    console.error("[GET /api/exam-sessions/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load exam session",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSessionSchema.safeParse(body);
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

    const session = await ExamSession.findOne({ _id: id, guildId });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const next = {
      name: parsed.data.name ?? session.name,
      amStartUtc: parsed.data.amStartUtc ?? session.amStartUtc,
      amEndUtc: parsed.data.amEndUtc ?? session.amEndUtc,
      pmStartUtc: parsed.data.pmStartUtc ?? session.pmStartUtc,
      pmEndUtc: parsed.data.pmEndUtc ?? session.pmEndUtc,
      status: parsed.data.status ?? session.status,
    };

    assertSlotOrder(next);

    const windowsChanged =
      next.amStartUtc !== session.amStartUtc ||
      next.amEndUtc !== session.amEndUtc ||
      next.pmStartUtc !== session.pmStartUtc ||
      next.pmEndUtc !== session.pmEndUtc;

    session.name = next.name;
    session.amStartUtc = next.amStartUtc;
    session.amEndUtc = next.amEndUtc;
    session.pmStartUtc = next.pmStartUtc;
    session.pmEndUtc = next.pmEndUtc;
    session.status = next.status;
    await session.save();

    let updatedPapers = 0;
    if (windowsChanged) {
      const scheduled = await ExamPaper.find({
        sessionId: id,
        guildId,
        status: "scheduled",
      });

      for (const paper of scheduled) {
        const { lockAt, unlockAt } = computePaperWindow(
          {
            amStartUtc: next.amStartUtc,
            amEndUtc: next.amEndUtc,
            pmStartUtc: next.pmStartUtc,
            pmEndUtc: next.pmEndUtc,
          },
          {
            date: paper.date,
            slot: paper.slot,
          },
        );
        paper.lockAt = lockAt;
        paper.unlockAt = unlockAt;
        await paper.save();
        updatedPapers += 1;
      }
    }

    return NextResponse.json({
      session,
      recomputedScheduledPapers: updatedPapers,
    });
  } catch (err) {
    console.error("[PATCH /api/exam-sessions/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update exam session",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { id } = await context.params;
    const { ExamSession, ExamPaper } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const session = await ExamSession.findOne({ _id: id, guildId });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const lockedCount = await ExamPaper.countDocuments({
      sessionId: id,
      guildId,
      status: "locked",
    });
    if (lockedCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a session while papers are locked. Force-unlock or wait for unlock first.",
        },
        { status: 409 },
      );
    }

    await ExamPaper.deleteMany({ sessionId: id, guildId });
    await session.deleteOne();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/exam-sessions/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete exam session",
      },
      { status: 500 },
    );
  }
}
