import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectMember,
  updateProjectMemberPermissions,
  removeProjectMember,
  getProjectStats,
  updateProjectComment,
  getProjectComments,
  createProjectComment,
  deleteProjectComment,
  getProjectActivity,
  getProjectMembers,
  updateProjectMemberRole,
} from "../services/project.service";
import {
  checkProjectPermission,
  checkAssignmentLimit,
} from "../middleware/permission.middleware";
import { auditLog } from "../middleware/audit.middleware";
import { AuditAction, EntityType, ProjectMemberRole } from "@prisma/client";
import { getRelatedProjectsController } from "../controllers/project_relationship.controller";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";
import multer from "multer";
import prisma from "../config/db";
import { ApiError, HttpStatus } from "../utils/error.utils";

const router = Router();

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (_req, file) => {
    // Determine resource type based on mime type
    const isImage = file.mimetype.startsWith("image/");
    // const isPdf = file.mimetype === "application/pdf";
    // const isDocument =
    //   file.mimetype.includes("word") ||
    //   file.mimetype.includes("document") ||
    //   file.mimetype.includes("spreadsheet") ||
    //   file.mimetype.includes("excel");

    return {
      folder: "project-files",
      resource_type: isImage ? "image" : "raw", // Use "raw" for non-images
      allowed_formats: [
        "jpg",
        "png",
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "txt",
      ],
      public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});
/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private/Project Manager/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  [
    check("name", "Name is required").notEmpty(),
    check("portfolioId", "Portfolio ID is required").notEmpty(),
    check("startDate", "Start date is required")
      .notEmpty()
      .isISO8601()
      .toDate(),
    check("endDate", "End date is required").notEmpty().isISO8601().toDate(),
    validate,
  ],
  auditLog({
    action: AuditAction.CREATED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const {
      name,
      description,
      startDate,
      endDate,
      status,
      portfolioId,
      programId,
    } = req.body;

    const project = await createProject(
      {
        name,
        description,
        startDate,
        endDate,
        status,
        portfolioId,
        programId,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: project,
    });
  })
);

/**
 * @route   GET /api/projects
 * @desc    Get all projects
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { portfolioId, status, search } = req.query;

    const projects = await getAllProjects(
      {
        role: req.user.role,
        userId: req.user.userId,
      },
      {
      portfolioId: portfolioId as string,
      status: status as any,
      search: search as string,
      }
    );

    res.status(200).json({
      success: true,
      data: projects,
    });
  })
);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const project = await getProjectById(id);

    res.status(200).json({
      success: true,
      data: project,
    });
  })
);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PROJECT,
  }),
  checkProjectPermission("project.edit"),
  [
    check("name", "Name must not be empty").optional().notEmpty(),
    check("startDate", "Start date must be valid")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "End date must be valid").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const {
      name,
      description,
      startDate,
      endDate,
      status,
      portfolioId,
      programId,
    } = req.body;

    const project = await updateProject(
      id,
      {
        name,
        description,
        startDate,
        endDate,
        status,
        portfolioId,
        programId,
      },
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: project,
    });
  })
);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  checkProjectPermission("project.delete"),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteProject(id, req.user.userId, req.user.role);

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  })
);
/**
 * @route   GET /api/projects/:projectId/members
 * @desc    Get all project comments
 * @access  Private
 */
router.get(
  "/:projectId/members",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const members = await getProjectMembers(
      projectId,
      {
        role: req.user.role,
        userId: req.user.userId,
      },
    );

    res.status(200).json({
      success: true,
      data: members,
    });
  })
);

/**
 * @route   POST /api/projects/:projectId/members
 * @desc    Add member to project
 * @access  Private
 */
router.post(
  "/:projectId/members",
  authenticate,
  checkProjectPermission("project.edit"),
  auditLog({
    action: AuditAction.ASSIGNED,
    entityType: EntityType.PROJECT,
  }),
  checkAssignmentLimit,
  [
    check("userId", "User ID is required").notEmpty(),
    check("role", "Role must be valid")
      .optional()
      .isIn(["PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
    ,
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { userId, permissionIds, role } = req.body;

    const projectMember = await addProjectMember(
      projectId,
      userId,
      permissionIds,
      req.user!.userId,
      role || ProjectMemberRole.TEAM_MEMBER,
      req.user.role
    );

    res.status(201).json({
      success: true,
      data: projectMember,
    });
  })
);

/**
 * @route   PUT /api/projects/:projectId/members/:userId
 * @desc    Update project member permissions
 * @access  Private
 */
router.put(
  "/:projectId/members/:userId",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  checkProjectPermission("project.edit"),
  [
    check("permissionIds", "Permission IDs must be an array").isArray(),
    check("role", "Role must be valid")
      .optional()
      .isIn(["PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId, userId } = req.params;
    const { permissionIds, role } = req.body;

    // If only role is being updated
    if (role && !permissionIds) {
      const projectMember = await updateProjectMemberRole(
        projectId,
        userId,
        role as ProjectMemberRole,
        req.user!.userId,
      );
      return res.status(200).json({
        success: true,
        data: projectMember,
        message: "Member role updated successfully",
      });
    }

    // If permissions are being updated (with or without role)
    const projectMember = await updateProjectMemberPermissions(
      projectId,
      userId,
      permissionIds,
      role as ProjectMemberRole | undefined, // 👈 ADD THIS
      {
        role: req.user.role,
        userId: req.user.userId,
      },
    );

    res.status(200).json({
      success: true,
      data: projectMember,
      message: "Member updated successfully",
    });
  })
);

router.patch(
  "/:projectId/members/:userId/role",
  authenticate,
  checkProjectPermission("project.edit"),
  [
    check("role", "Role is required")
      .notEmpty()
      .isIn(["PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId, userId } = req.params;
    const { role } = req.body;

    const projectMember = await updateProjectMemberRole(
      projectId,
      userId,
      role as ProjectMemberRole,
      req.user!.userId,
    );

    res.status(200).json({
      success: true,
      data: projectMember,
      message: `Role updated to ${role
        .toLowerCase()
        .replace("_", " ")} successfully`,
    });
  })
);
/**
 * @route   DELETE /api/projects/:projectId/members/:userId
 * @desc    Remove member from project
 * @access  Private
 */
router.delete(
  "/:projectId/members/:userId",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  checkProjectPermission("project.edit"),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId, userId } = req.params;

    await removeProjectMember(
      projectId, 
      userId,
    );

    res.status(200).json({
      success: true,
      message: "Member removed from project successfully",
    });
  })
);

/**
 * @route   GET /api/projects/:id/stats
 * @desc    Get project statistics
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stats = await getProjectStats(id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   POST /api/projects/:projectId/comments
 * @desc    Create a new project comment
 * @access  Private
 */
router.post(
  "/:projectId/comments",
  authenticate,
  checkProjectPermission("project.view"),
  [check("content", "Content is required").notEmpty(), validate],
  auditLog({
    action: AuditAction.CREATED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { content } = req.body;

    const comment = await createProjectComment(
      projectId,
      req.user!.userId,
      content
    );

    res.status(201).json({
      success: true,
      data: comment,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/comments
 * @desc    Get all project comments
 * @access  Private
 */
router.get(
  "/:projectId/comments",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const comments = await getProjectComments(
      projectId,
      {
        userId: req.user.userId,
        role: req.user.role
      }
    );

    res.status(200).json({
      success: true,
      data: comments,
    });
  })
);

/**
 * @route   PATCH /api/projects/:projectId/comments/:commentId
 * @desc    Update project comment
 * @access  Private
 */
router.patch(
  "/:projectId/comments/:commentId",
  authenticate,
  checkProjectPermission("project.view"),
  [check("content", "Content is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { commentId } = req.params;
    const { content } = req.body;

    const comment = await updateProjectComment(
      commentId,
      req.user!.userId,
      content
    );

    res.status(200).json({
      success: true,
      data: comment,
    });
  })
);

/**
 * @route   DELETE /api/projects/:projectId/comments/:commentId
 * @desc    Delete project comment
 * @access  Private
 */
router.delete(
  "/:projectId/comments/:commentId",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { commentId } = req.params;

    await deleteProjectComment(commentId, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/activity
 * @desc    Get project activity log
 * @access  Private
 */
router.get(
  "/:projectId/activity",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const activities = await getProjectActivity(projectId);

    res.status(200).json({
      success: true,
      data: activities,
    });
  })
);

/**
 * GET /api/projects/:projectId/related
 * Get all related projects for a specific project
 */
router.get(
  "/:projectId/related",
  authenticate,
  checkProjectPermission("project.view"),
  getRelatedProjectsController
);

/**
 * @route   GET /api/projects/:projectId/files
 * @desc    Get all project files
 * @access  Private
 */
router.get(
  "/:projectId/files",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { search } = req.query;

    const files = await prisma.projectFile.findMany({
      where: {
        projectId,
        ...(search && {
          OR: [
            { originalName: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      data: files,
    });
  })
);

/**
 * @route   POST /api/projects/:projectId/files
 * @desc    Upload files to project (stores in Cloudinary)
 * @access  Private
 */
router.post(
  "/:projectId/files",
  authenticate,
  checkProjectPermission("project.view"),
  upload.array("files", 10), // Max 10 files at once
  auditLog({
    action: AuditAction.UPLOADED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const files = req.files as any[];

    if (!files || files.length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "No files uploaded");
    }

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        return await prisma.projectFile.create({
          data: {
            filename: file.filename, // Cloudinary public_id
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            projectId,
            uploadedById: req.user!.userId,
          },
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });
      })
    );

    res.status(201).json({
      success: true,
      data: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/files/:fileId/download
 * @desc    Get Cloudinary download URL
 * @access  Private
 */
router.get(
  "/:projectId/files/:fileId/download",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { fileId } = req.params;

    const file = await prisma.projectFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new ApiError(HttpStatus.NOT_FOUND, "File not found");
    }

    // Get Cloudinary URL with download flag
    const resourceType = file.mimeType.startsWith("image/") ? "image" : "raw";
    const downloadUrl = cloudinary.url(file.filename, {
      resource_type: resourceType,
      flags: "attachment:" + file.originalName, // Force download with original name
    });

    res.status(200).json({
      success: true,
      data: {
        url: downloadUrl,
        originalName: file.originalName,
      },
    });
  })
);

/**
 * @route   DELETE /api/projects/:projectId/files/:fileId
 * @desc    Delete a project file from Cloudinary
 * @access  Private
 */
router.delete(
  "/:projectId/files/:fileId",
  authenticate,
  checkProjectPermission("project.edit"),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.FILE,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { fileId } = req.params;

    const file = await prisma.projectFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new ApiError(HttpStatus.NOT_FOUND, "File not found");
    }

    // Delete from Cloudinary
    const resourceType = file.mimeType.startsWith("image/") ? "image" : "raw";
    try {
      await cloudinary.uploader.destroy(file.filename, {
        resource_type: resourceType,
      });
    } catch (error) {
      console.error("Cloudinary deletion error:", error);
      // Continue with database deletion even if Cloudinary fails
    }

    // Delete from database
    await prisma.projectFile.delete({
      where: { id: fileId },
    });

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  })
);
export default router;
