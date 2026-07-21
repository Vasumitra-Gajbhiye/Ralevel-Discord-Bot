import "server-only";

import { connectDB, User } from "@ralevel/db";

let connected = false;

/**
 * Ensures a single shared MongoDB connection for Next.js server code.
 * Uses the same models as the Discord bot via @ralevel/db.
 */
export async function ensureDb() {
  if (!connected) {
    await connectDB();
    connected = true;
  }
  return { User };
}

export { connectDB, User };
