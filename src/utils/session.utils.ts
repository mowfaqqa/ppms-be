import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

export const createSession = async (
  userId: string,
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS);

  // Remove any existing sessions for this user (single session policy)
  // Remove this block if you want to allow multiple concurrent sessions
  await prisma.userSession.deleteMany({ where: { userId } });

  await prisma.userSession.create({
    data: {
      userId,
      token,
      ipAddress,
      userAgent,
      lastActivity: now,
      expiresAt,
    },
  });
};

export const refreshSession = async (token: string): Promise<boolean> => {
  const session = await prisma.userSession.findUnique({ where: { token } });

  if (!session) return false;

  const now = new Date();

  // Check if session has expired
  if (session.expiresAt < now) {
    await prisma.userSession.delete({ where: { token } });
    return false;
  }

  // Slide the expiry window forward on activity
  const newExpiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS);
  await prisma.userSession.update({
    where: { token },
    data: {
      lastActivity: now,
      expiresAt: newExpiresAt,
    },
  });

  return true;
};

export const deleteSession = async (token: string): Promise<void> => {
  await prisma.userSession.deleteMany({ where: { token } });
};

export const deleteAllUserSessions = async (userId: string): Promise<void> => {
  await prisma.userSession.deleteMany({ where: { userId } });
};

// Cleanup job — call this on a cron or at app startup
export const purgeExpiredSessions = async (): Promise<void> => {
  await prisma.userSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};