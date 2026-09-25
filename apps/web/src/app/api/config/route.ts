import { NextResponse } from "next/server";
import {
  ensureDb,
  getOrCreateGuildConfig,
  guildConfigToJson,
} from "@/lib/db";
import { requireAllowlistedAuth } from "@/lib/auth";
import {
  normalizeReputationIdLabels,
  normalizeRanksConfig,
  normalizeModPointsConfig,
  normalizeDefinitionsConfig,
} from "@ralevel/db";
import { getCommandCatalog } from "@ralevel/shared/commandCatalog";
import { validateCommandDisplayNames } from "@ralevel/shared/commandDisplayNames";
import { validateCommandMetadataOverrides } from "@ralevel/shared/commandMetadataOverrides";

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
  "commandDiscordPermissions",
  "commandDisplayNames",
  "commandMetadataOverrides",
  "commandEphemeral",
  "channels",
  "categories",
  "features",
  "reputation",
  "ranks",
  "schedules",
  "welcome",
  "certificates",
  "confessions",
  "modmail",
  "tasks",
  "polls",
  "sticky",
  "helper",
  "definitions",
  "qotd",
  "moderation",
] as const;

type DefinitionsJson = {
  subjects?: { id: string }[];
  boards?: { id: string }[];
};

/**
 * Subjects/boards that still have definitions can't be removed (they'd become
 * orphaned) — they should be disabled instead.
 */
async function findRemovedEntriesInUse(
  before: DefinitionsJson | undefined,
  after: DefinitionsJson,
): Promise<string[]> {
  const { Definition } = await ensureDb();
  const errors: string[] = [];
  const checks = [
    { list: "subjects", field: "subjectId", noun: "Subject" },
    { list: "boards", field: "boardId", noun: "Board" },
  ] as const;

  for (const { list, field, noun } of checks) {
    const kept = new Set((after[list] ?? []).map((e) => e.id));
    const removed = (before?.[list] ?? [])
      .map((e) => e.id)
      .filter((id) => !kept.has(id));
    for (const id of removed) {
      const count = await Definition.countDocuments({ [field]: id });
      if (count > 0) {
        errors.push(
          `${noun} "${id}" still has ${count} definition(s). Disable it instead of removing it.`,
        );
      }
    }
  }
  return errors;
}

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

    if (body.commandDisplayNames !== undefined) {
      const validation = validateCommandDisplayNames(
        getCommandCatalog(),
        body.commandDisplayNames,
      );
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join("; ") },
          { status: 400 },
        );
      }
      body.commandDisplayNames = validation.displayNames;
    }

    if (body.commandMetadataOverrides !== undefined) {
      const validation = validateCommandMetadataOverrides(
        getCommandCatalog(),
        body.commandMetadataOverrides,
      );
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join("; ") },
          { status: 400 },
        );
      }
      body.commandMetadataOverrides = validation.overrides;
    }

    if (body.moderation?.points !== undefined) {
      const validation = normalizeModPointsConfig(body.moderation.points);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join("; ") },
          { status: 400 },
        );
      }
      body.moderation.points = validation.points;
    }

    if (body.definitions !== undefined) {
      const validation = normalizeDefinitionsConfig(body.definitions);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join("; ") },
          { status: 400 },
        );
      }
      const inUse = await findRemovedEntriesInUse(
        guildConfigToJson(doc).definitions as DefinitionsJson | undefined,
        validation.definitions,
      );
      if (inUse.length) {
        return NextResponse.json({ error: inUse.join("; ") }, { status: 400 });
      }
      body.definitions = validation.definitions;
    }

    for (const key of PATCHABLE) {
      if (body[key] !== undefined) {
        if (key === "reputation") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any)[key] = normalizeReputationIdLabels(body.reputation);
          doc.markModified(key);
        } else if (key === "ranks") {
          const normalized = normalizeRanksConfig(doc.roles, body.ranks);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any).roles = normalized.roles;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any).ranks = normalized.ranks;
          doc.markModified("roles");
          doc.markModified("ranks");
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any)[key] = body[key];
          if (
            key === "commandPermissions" ||
            key === "commandDiscordPermissions" ||
            key === "commandDisplayNames" ||
            key === "commandMetadataOverrides" ||
            key === "commandEphemeral" ||
            key === "qotd" ||
            key === "moderation" ||
            key === "definitions"
          ) {
            doc.markModified(key);
          }
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
