import { Request, Response, NextFunction } from "express";
import { ApiError, HttpStatus } from "../utils/error.utils";
import path from "path";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import cloudinary from "../config/cloudinary";

// Configure multer storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (_req, file) => {
    return {
      folder: "project-files",
      resource_type: "raw",
      public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
    };
  },
});

// File filter
const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// File filter
const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
    return cb(new ApiError(HttpStatus.BAD_REQUEST, "File type not allowed"));
  }

  cb(null, true);
};

// Configure upload
const upload = multer({
  storage: storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Handle multer errors
export const handleMulterErrors = (
  err: any,
  req: Request,
  res: any,
  next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(HttpStatus.BAD_REQUEST, "File too large"));
    }
  }

  if (err.name === "TimeoutError") {
    return res.status(504).json({
      success: false,
      message: "File upload timed out. Please try again.",
    });
  }

  if (err) {
    return next(new ApiError(HttpStatus.BAD_REQUEST, err.message));
  }
  next();
};

export default upload;
