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
} from "../services/project.service";
import {
  checkProjectPermission,
  checkAssignmentLimit,
} from "../middleware/permission.middleware";
import { auditLog } from "../middleware/audit.middleware";
import { AuditAction, EntityType } from "@prisma/client";
import { getRelatedProjectsController } from "../controllers/project_relationship.controller";

const router = Router();

/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private/Project Manager/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER"]),
  [
    check("name", "Name is required").notEmpty(),
    check("pillarId", "Pillar ID is required").notEmpty(),
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
    const { name, description, startDate, endDate, status, pillarId } =
      req.body;

    const project = await createProject(
      {
        name,
        description,
        startDate,
        endDate,
        status,
        pillarId,
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
    const { pillarId, status, search } = req.query;

    const projects = await getAllProjects({
      pillarId: pillarId as string,
      status: status as any,
      search: search as string,
    });

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
    const { name, description, startDate, endDate, status, pillarId } =
      req.body;

    const project = await updateProject(id, {
      name,
      description,
      startDate,
      endDate,
      status,
      pillarId,
    });

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
  checkProjectPermission("project.delete"),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteProject(id);

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

    const members = await getProjectMembers(projectId);

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
    // check("permissionIds", "Permission IDs must be an array").isArray(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { userId, permissionIds } = req.body;

    const projectMember = await addProjectMember(
      projectId,
      userId,
      permissionIds,
      req.user!.userId
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
  checkProjectPermission("project.edit"),
  [
    check("permissionIds", "Permission IDs must be an array").isArray(),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId, userId } = req.params;
    const { permissionIds } = req.body;

    const projectMember = await updateProjectMemberPermissions(
      projectId,
      userId,
      permissionIds
    );

    res.status(200).json({
      success: true,
      data: projectMember,
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
  checkProjectPermission("project.edit"),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PROJECT,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { projectId, userId } = req.params;

    await removeProjectMember(projectId, userId);

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

    const comments = await getProjectComments(projectId);

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
export default router;
