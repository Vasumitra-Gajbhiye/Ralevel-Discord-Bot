import { clerkClient } from "@clerk/nextjs/server";
import { ensureDb } from "@/lib/db";

export const SEED_EMAIL = "vasumitragajbhiye20@gmail.com";
export const SEED_NAME = "Admin";

const ALLOWLIST_CACHE_TTL_MS = 60_000;
let allowlistCache: { emails: Set<string>; expiresAt: number } | null = null;

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function invalidateAllowlistCache(): void {
  allowlistCache = null;
}

async function getAllowlistedEmails(): Promise<Set<string>> {
  const now = Date.now();
  if (allowlistCache && allowlistCache.expiresAt > now) {
    return allowlistCache.emails;
  }

  const identifiers = await listAllowlistIdentifiers();
  const emails = new Set(
    identifiers.map((entry) => normalizeEmail(entry.identifier)),
  );
  emails.add(SEED_EMAIL);

  allowlistCache = { emails, expiresAt: now + ALLOWLIST_CACHE_TTL_MS };
  return emails;
}

export async function isEmailAllowlisted(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (normalized === SEED_EMAIL) return true;
  const emails = await getAllowlistedEmails();
  return emails.has(normalized);
}

export type AccessEntry = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
};

async function listAllowlistIdentifiers() {
  const client = await clerkClient();
  const list = await client.allowlistIdentifiers.getAllowlistIdentifierList({
    limit: 100,
  });
  return list.data;
}

async function listAccessLabels(): Promise<Map<string, string>> {
  const { DashboardAccess } = await ensureDb();
  const docs = (await DashboardAccess.find({}).lean()) as Array<{
    email: string;
    name?: string;
  }>;
  return new Map(
    docs.map((doc) => [
      String(doc.email).toLowerCase(),
      String(doc.name ?? ""),
    ]),
  );
}

export async function listAccessEntries(): Promise<AccessEntry[]> {
  const [allowlist, labels] = await Promise.all([
    listAllowlistIdentifiers(),
    listAccessLabels(),
  ]);

  return allowlist.map((entry) => ({
    id: entry.id,
    email: entry.identifier,
    name: labels.get(entry.identifier.toLowerCase()) ?? "",
    createdAt: entry.createdAt,
  }));
}

export async function findAccessEntryById(id: string): Promise<AccessEntry | null> {
  const entries = await listAccessEntries();
  return entries.find((entry) => entry.id === id) ?? null;
}

export async function upsertAccessLabel(
  email: string,
  name: string,
): Promise<void> {
  const { DashboardAccess } = await ensureDb();
  await DashboardAccess.findOneAndUpdate(
    { email: email.toLowerCase() },
    { email: email.toLowerCase(), name: name.trim() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function deleteAccessLabel(email: string): Promise<void> {
  const { DashboardAccess } = await ensureDb();
  await DashboardAccess.deleteOne({ email: email.toLowerCase() });
}

export async function ensureSeedAllowlist(): Promise<void> {
  const client = await clerkClient();
  const list = await client.allowlistIdentifiers.getAllowlistIdentifierList({
    limit: 100,
  });
  const exists = list.data.some(
    (entry) => entry.identifier.toLowerCase() === SEED_EMAIL,
  );
  if (!exists) {
    await client.allowlistIdentifiers.createAllowlistIdentifier({
      identifier: SEED_EMAIL,
      notify: false,
    });
    invalidateAllowlistCache();
  }

  const { DashboardAccess } = await ensureDb();
  const label = await DashboardAccess.findOne({ email: SEED_EMAIL });
  if (!label) {
    await DashboardAccess.create({ email: SEED_EMAIL, name: SEED_NAME });
  }
}
