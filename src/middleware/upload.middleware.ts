import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ApiError, HttpStatus } from "../utils/error.utils";
import path from "path";

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Accept all file types
  cb(null, true);
};

// Configure upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter,
});

// Handle multer errors
export const handleMulterErrors = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(HttpStatus.BAD_REQUEST, "File too large"));
    }
    return next(new ApiError(HttpStatus.BAD_REQUEST, err.message));
  }

  if (err) {
    return next(new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, err.message));
  }

  next();
};

export default upload;
