import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RESET_TOKEN_EXPIRY_MINUTES = 30;

/**
 * Generate a secure password reset token and store it in the DB
 */
export const createPasswordResetToken = async (userId: string): Promise<string> => {
  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token: hashedToken,
      expiresAt,
    },
  });

  // Return the raw token — this is what gets emailed to the user
  return rawToken;
};

/**
 * Validate a reset token. Returns userId if valid, throws otherwise.
 */
export const validatePasswordResetToken = async (rawToken: string): Promise<string> => {
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashedToken },
  });

  if (!record) {
    throw new Error("Invalid or expired reset token");
  }

  if (record.used) {
    throw new Error("Reset token has already been used");
  }

  if (record.expiresAt < new Date()) {
    throw new Error("Reset token has expired");
  }

  return record.userId;
};

/**
 * Mark a token as used after successful password reset
 */
export const consumePasswordResetToken = async (rawToken: string): Promise<void> => {
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.update({
    where: { token: hashedToken },
    data: { used: true },
  });
};