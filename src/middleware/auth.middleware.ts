import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.utils";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}

// Authenticate user middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        "Authorization token is required"
      );
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        "Invalid authorization format"
      );
    }

    const decoded = verifyToken(token);

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "User not found");
    }

    if (!user.isActive) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Account is inactive");
    }
    // Set user info in request
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(HttpStatus.UNAUTHORIZED, "Invalid or expired token"));
    }
  }
};

// Authorize by role middleware
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "User not authenticated");
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to access this resource"
      );
    }

    next();
  };
};
