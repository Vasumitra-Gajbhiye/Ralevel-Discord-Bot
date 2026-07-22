import { clerkClient } from "@clerk/nextjs/server";
import { ensureDb } from "@/lib/db";

export const SEED_EMAIL = "vasumitragajbhiye20@gmail.com";
export const SEED_NAME = "Admin";

const ALLOWLIST_CACHE_TTL_MS = 60_000;
let allowlistCache: { emails: Set<string>; expiresAt: number } | null = null;

type DashboardAccessDoc = {
  _id: { toString(): string };
  email: string;
  name?: string;
  createdAt: Date;
};

export type AccessEntry = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
};

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function invalidateAllowlistCache(): void {
  allowlistCache = null;
}

function docToEntry(doc: DashboardAccessDoc): AccessEntry {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name ?? "",
    createdAt: new Date(doc.createdAt).getTime(),
  };
}

function isClerkAllowlistUnavailable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 402
  );
}

async function listAccessDocuments(): Promise<DashboardAccessDoc[]> {
  const { DashboardAccess } = await ensureDb();
  return DashboardAccess.find({})
    .sort({ createdAt: 1 })
    .lean() as Promise<DashboardAccessDoc[]>;
}

async function getAllowlistedEmails(): Promise<Set<string>> {
  const now = Date.now();
  if (allowlistCache && allowlistCache.expiresAt > now) {
    return allowlistCache.emails;
  }

  const docs = await listAccessDocuments();
  const emails = new Set(docs.map((doc) => normalizeEmail(doc.email)));
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

export async function listAccessEntries(): Promise<AccessEntry[]> {
  const docs = await listAccessDocuments();
  return docs.map(docToEntry);
}

export async function findAccessEntryById(
  id: string,
): Promise<AccessEntry | null> {
  const { DashboardAccess } = await ensureDb();
  const doc = (await DashboardAccess.findById(id).lean()) as
    | DashboardAccessDoc
    | null;
  if (!doc) return null;
  return docToEntry(doc);
}

export async function addAccessEntry(
  email: string,
  name: string,
): Promise<AccessEntry> {
  const { DashboardAccess } = await ensureDb();
  const normalized = normalizeEmail(email);
  const doc = await DashboardAccess.create({
    email: normalized,
    name: name.trim(),
  });
  invalidateAllowlistCache();
  void syncEmailToClerkAllowlist(normalized);
  return docToEntry(doc as unknown as DashboardAccessDoc);
}

export async function upsertAccessLabel(
  email: string,
  name: string,
): Promise<void> {
  const { DashboardAccess } = await ensureDb();
  await DashboardAccess.findOneAndUpdate(
    { email: normalizeEmail(email) },
    { email: normalizeEmail(email), name: name.trim() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  invalidateAllowlistCache();
}

export async function deleteAccessLabel(email: string): Promise<void> {
  const { DashboardAccess } = await ensureDb();
  await DashboardAccess.deleteOne({ email: normalizeEmail(email) });
  invalidateAllowlistCache();
}

export async function deleteAccessEntryById(
  id: string,
): Promise<AccessEntry | null> {
  const { DashboardAccess } = await ensureDb();
  const doc = (await DashboardAccess.findByIdAndDelete(id).lean()) as
    | DashboardAccessDoc
    | null;
  if (!doc) return null;
  invalidateAllowlistCache();
  void removeEmailFromClerkAllowlist(doc.email);
  return docToEntry(doc);
}

async function syncEmailToClerkAllowlist(email: string): Promise<void> {
  try {
    const client = await clerkClient();
    const list = await client.allowlistIdentifiers.getAllowlistIdentifierList({
      limit: 100,
    });
    const normalized = normalizeEmail(email);
    const exists = list.data.some(
      (entry) => normalizeEmail(entry.identifier) === normalized,
    );
    if (!exists) {
      await client.allowlistIdentifiers.createAllowlistIdentifier({
        identifier: normalized,
        notify: false,
      });
    }
  } catch (err) {
    if (isClerkAllowlistUnavailable(err)) {
      console.warn(
        "[access] Clerk allowlist sync skipped (requires paid plan):",
        email,
      );
      return;
    }
    console.warn("[access] Clerk allowlist sync failed:", err);
  }
}

async function removeEmailFromClerkAllowlist(email: string): Promise<void> {
  try {
    const client = await clerkClient();
    const list = await client.allowlistIdentifiers.getAllowlistIdentifierList({
      limit: 100,
    });
    const normalized = normalizeEmail(email);
    const entry = list.data.find(
      (item) => normalizeEmail(item.identifier) === normalized,
    );
    if (entry) {
      await client.allowlistIdentifiers.deleteAllowlistIdentifier(entry.id);
    }
  } catch (err) {
    if (isClerkAllowlistUnavailable(err)) {
      console.warn(
        "[access] Clerk allowlist removal skipped (requires paid plan):",
        email,
      );
      return;
    }
    console.warn("[access] Clerk allowlist removal failed:", err);
  }
}

export async function ensureSeedAllowlist(): Promise<void> {
  const { DashboardAccess } = await ensureDb();
  await DashboardAccess.findOneAndUpdate(
    { email: SEED_EMAIL },
    { email: SEED_EMAIL, name: SEED_NAME },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  invalidateAllowlistCache();
  void syncEmailToClerkAllowlist(SEED_EMAIL);
}
