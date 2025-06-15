import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ApiError, HttpStatus } from "../utils/error.utils";
import path from "path";

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (cb: any) {
    cb(null, "uploads/");
  },
  filename: function (file: any, cb: any) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter
const fileFilter = (cb: any) => {
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
export const handleMulterErrors = (err: Error, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if ("code" in err && err.code === "LIMIT_FILE_SIZE") {
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
