import { Router } from "express";
import { check } from "express-validator";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { hashPassword } from "../utils/password.utils";
import {
  createPasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
} from "../utils/password-reset.utils";
import {
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
} from "../utils/email.utils";

const prisma = new PrismaClient();
const router = Router();

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request a password reset link
 * @access  Public
 *
 * Always responds with 200 to avoid leaking whether an email exists.
 */
router.post(
  "/forgot-password",
  [
    check("email", "Please include a valid email").isEmail(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Respond identically whether or not the user exists (prevent email enumeration)
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    try {
      const rawToken = await createPasswordResetToken(user.id);
      await sendPasswordResetEmail(user.email, user.name, rawToken);
    } catch (error) {
      console.error("Password reset flow error:", error);
      // Still return 200 — don't expose internal errors to the client
    }

    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  })
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using a valid token
 * @access  Public
 */
router.post(
  "/reset-password",
  [
    check("token", "Reset token is required").notEmpty(),
    check("newPassword", "Password must be at least 8 characters").isLength({ min: 8 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { token, newPassword } = req.body;

    // 1. Validate the token and retrieve the userId
    let userId: string;
    try {
      userId = await validatePasswordResetToken(token);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Invalid or expired reset token",
      });
    }

    // 2. Fetch the user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return res.status(400).json({
        success: false,
        message: "User not found or account is inactive",
      });
    }

    // 3. Hash the new password and update the user record
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        temporaryPassword: false,
        passwordChangedAt: new Date(),
      },
    });

    // 4. Invalidate the used token
    await consumePasswordResetToken(token);

    // 5. Invalidate all active sessions so the user must log in fresh
    await prisma.userSession.deleteMany({ where: { userId } });

    // 6. Send confirmation email (fire-and-forget — don't block the response)
    sendPasswordResetSuccessEmail(user.email, user.name).catch((err) =>
      console.error("Failed to send reset success email:", err)
    );

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. Please log in with your new password.",
    });
  })
);

export default router;