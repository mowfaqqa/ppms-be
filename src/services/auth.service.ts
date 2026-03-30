import { PrismaClient, User, Role } from "@prisma/client";
import { hashPassword, comparePassword } from "../utils/password.utils";
import { generateToken, verifyToken } from "../utils/jwt.utils";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { createSession } from "../utils/session.utils";
import { sendPasswordResetEmail, sendPasswordResetSuccessEmail } from "../utils/email.utils";

const prisma = new PrismaClient();

// Register new user
export const register = async (
  email: string,
  password: string,
  name: string,
  role: Role = "TEAM_MEMBER",
  ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; token: string }> => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ApiError(HttpStatus.CONFLICT, "User already exists");
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create new user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role,
    },
  });

  // Generate token
  const token = generateToken({
    userId: user.id,
    role: user.role,
  });
await createSession(user.id, token, ipAddress, userAgent);
  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword as User,
    token,
  };
};

// Login user
export const login = async (
  email: string,
  password: string,
    ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; token: string }> => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  // Generate token
  const token = generateToken({
    userId: user.id,
    role: user.role,
  });
await createSession(user.id, token, ipAddress, userAgent);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword as User,
    token,
  };
};

export const forgotPassword = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  const user = await prisma.user.findUnique({ where: { email } });
 
  // Silent no-op for unknown emails — don't reveal whether account exists
  if (!user) {
    return {
      success: true,
      message:
        "If an account exists for that email, a reset link has been sent.",
    };
  }
 
  const resetToken = generateToken({
    userId: user.id,
    role: user.role,
  }, '30m');
  // Fire-and-forget — don't block the response on email delivery
  sendPasswordResetEmail(user.email, user.name, resetToken).catch((err) =>
    console.error("Failed to send password reset email:", err)
  );
 
  return {
    success: true,
    message:
      "If an account exists for that email, a reset link has been sent.",
  };
};

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> => {
 
  let payload: { userId: string };
  console.log(token)
 
  try {
    payload = verifyToken(token);
  } catch (err) {
    console.error("Password reset token verification failed:", err);
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Reset link is invalid or has expired. Please request a new one."
    );
  }
 
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
 
  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found.");
  }
 
  const hashedPassword = await hashPassword(newPassword);
 
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });
 
  // Send confirmation email (non-blocking)
  sendPasswordResetSuccessEmail(user.email, user.name).catch((err) =>
    console.error("Failed to send password reset success email:", err)
  );
 
  return { success: true, message: "Password has been reset successfully." };
};
