import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { ApiError, HttpStatus } from "../utils/error.utils";
import logger from "../config/logger";

// Validate request
export const validate = (req: Request, res: any, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

// Error handler middleware
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: any,
  next: NextFunction
) => {
  logger.error(`${err.name}: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Handle Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      message: "Database operation failed",
      error: err.message,
    });
  }

  // Default error response
  return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

// Not found middleware
export const notFound = (req: Request, res: any, next: NextFunction) => {
  const error = new ApiError(
    HttpStatus.NOT_FOUND,
    `Not found - ${req.originalUrl}`
  );
  next(error);
};
