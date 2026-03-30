import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import type { StringValue } from "ms";

// User payload for JWT
export interface UserPayload {
  userId: string;
  role: Role;
}

// Generate JWT token
export const generateToken = (payload: UserPayload, expiresIn: StringValue | number = "2d"): string => {
  const options: SignOptions = {
    expiresIn,
  };

  console.log(
    `Generating token for user ${payload.userId} with expiration: ${expiresIn} seconds`
  );

  // Ensure JWT_SECRET is defined or use a fallback
  const jwtSecret =
    process.env.JWT_SECRET || "default_secret_do_not_use_in_production";

  return jwt.sign(payload, jwtSecret, options);
};

// Verify JWT token with better error handling
export const verifyToken = (token: string): UserPayload => {
  try {
    const jwtSecret =
      process.env.JWT_SECRET || "default_secret_do_not_use_in_production";
    const decoded = jwt.verify(token, jwtSecret) as UserPayload;

    return decoded;
  } catch (error) {
    console.error("Token verification failed:", error);

    // Re-throw with more helpful message
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Your authentication token has expired");
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid authentication token");
    } else {
      throw new Error("Authentication failed");
    }
  }
};
