import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

// User payload for JWT
export interface UserPayload {
  userId: string;
  role: Role;
}

// Generate JWT token
export const generateToken = (payload: any): string => {
  return jwt.sign(payload, process.env.JWT_SECRET || "default_secret", {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};

// Verify JWT token
export const verifyToken = (token: string): UserPayload => {
  return jwt.verify(
    token,
    process.env.JWT_SECRET || "default_secret"
  ) as UserPayload;
};
