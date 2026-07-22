import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import { isEmailAllowlisted } from "@/lib/access";

export async function requireAuth(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export function getEmailFromUser(user: User): string | null {
  return (
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  return getEmailFromUser(user);
}

export type AllowlistAuthResult =
  | { authorized: true; userId: string; email: string }
  | { authorized: false; status: 401 | 403 };

export async function requireAllowlistedAuth(): Promise<AllowlistAuthResult> {
  const { userId } = await auth();
  if (!userId) return { authorized: false, status: 401 };

  const email = await getCurrentUserEmail();
  if (!email || !(await isEmailAllowlisted(email))) {
    return { authorized: false, status: 403 };
  }

  return { authorized: true, userId, email };
}
