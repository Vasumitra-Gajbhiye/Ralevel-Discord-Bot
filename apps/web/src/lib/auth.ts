import { auth } from "@clerk/nextjs/server";

export async function requireAuth(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
