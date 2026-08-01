import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowlistedAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const timeUtcSchema = z
  .string()
  .transform((v) => v.slice(0, 5))
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm UTC"));

const createSessionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amStartUtc: timeUtcSchema,
  amEndUtc: timeUtcSchema,
  pmStartUtc: timeUtcSchema,
  pmEndUtc: timeUtcSchema,
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

export async function GET() {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const { ExamSession } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const sessions = await ExamSession.find({ guildId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[GET /api/exam-sessions]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load exam sessions",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAllowlistedAuth();
  if (!authResult.authorized) return unauthorized(authResult);

  try {
    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    assertSlotOrder(parsed.data);

    const { ExamSession } = await ensureDb();
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return NextResponse.json({ error: "GUILD_ID is not set" }, { status: 500 });
    }

    const session = await ExamSession.create({
      guildId,
      ...parsed.data,
      status: "active",
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/exam-sessions]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create exam session",
      },
      { status: 500 },
    );
  }
}
