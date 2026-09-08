import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";

// User payload for JWT
export interface UserPayload {
  userId: string;
  role: Role;
}

// Resolve the signing key. Fails loudly rather than falling back to a
// hardcoded default, which would let anyone with the source forge tokens.
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to sign or verify tokens with a default key."
    );
  }

  return secret;
};

// Generate JWT token
export const generateToken = (payload: UserPayload): string => {
  // Default to 2 days (172800 seconds) if not specified
  const expiresIn = 172800;

  const options: SignOptions = {
    expiresIn,
  };

  console.log(
    `Generating token for user ${payload.userId} with expiration: ${expiresIn} seconds`
  );

  return jwt.sign(payload, getJwtSecret(), options);
};

// Verify JWT token with better error handling
export const verifyToken = (token: string): UserPayload => {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as UserPayload;

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
