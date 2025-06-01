import { Router } from "express";
import { asyncHandler } from "../utils/common.utils";
import { authenticate } from "../middleware/auth.middleware";

import upload, { handleMulterErrors } from "../middleware/upload.middleware";
import {
  uploadFile,
  getFiles,
  deleteFile,
  getFileVersions,
} from "../services/file.service";

const router = Router();

/**
 * @route   POST /api/files/upload
 * @desc    Upload file
 * @access  Private
 */
router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  handleMulterErrors,
  asyncHandler(async (req: any, res:any) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { projectId, taskId } = req.body;

    const file = await uploadFile(
      req.file,
      {
        projectId,
        taskId,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: file,
    });
  })
);

/**
 * @route   GET /api/files/:id
 * @desc    Get file by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // const file = await getFileById(id, req.user!.userId);

    res.status(200).json({
      success: true,
      // data: file,
    });
  })
);

/**
 * @route   GET /api/files
 * @desc    Get files for project or task
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId, taskId } = req.query;

    if (!projectId && !taskId) {
      return res.status(400).json({
        success: false,
        message: "Either projectId or taskId must be provided",
      });
    }

    const files = await getFiles({
      projectId: projectId as string,
      taskId: taskId as string,
    });

    res.status(200).json({
      success: true,
      data: files,
    });
  })
);

/**
 * @route   DELETE /api/files/:id
 * @desc    Delete file
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteFile(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  })
);

/**
 * @route   GET /api/files/:id/versions
 * @desc    Get file versions
 * @access  Private
 */
router.get(
  "/:id/versions",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req?.params;

    const versions = await getFileVersions(id);

    res.status(200).json({
      success: true,
      data: versions,
    });
  })
);

export default router;
