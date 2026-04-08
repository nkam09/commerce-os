import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export type AuthUser = {
  clerkId: string;
  userId: string;
};

/**
 * Requires an authenticated Clerk session and resolves the internal User record.
 * Creates the User row on first sign-in (upsert).
 * Throws a 401-style error if the session is missing.
 */
export async function requireUser(): Promise<AuthUser> {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.upsert({
    where: { clerkId },
    create: { clerkId },
    update: {},
    select: { id: true, clerkId: true },
  });

  return { clerkId, userId: user.id };
}
