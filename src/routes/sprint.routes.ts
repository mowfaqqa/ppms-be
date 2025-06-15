import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { checkProjectPermission } from "../middleware/permission.middleware";
import {
  createSprint,
  getProjectSprints,
  getSprintById,
  updateSprint,
  deleteSprint,
  startSprint,
  completeSprint,
  getSprintStats,
  moveIncompleteTasksToBacklog,
  getActiveSprint,
  getSprintTasksGrouped,
} from "../services/sprint.service";

const router = Router();

/**
 * @route   POST /api/projects/:projectId/sprints
 * @desc    Create a new sprint for a project
 * @access  Private - Requires sprint.create permission
 */
router.post(
  "/projects/:projectId/sprints",
  authenticate,
  checkProjectPermission("sprint.create"),
  [
    check("name", "Sprint name is required").notEmpty().trim(),
    check("name", "Sprint name must be between 1 and 100 characters")
      .isLength({ min: 1, max: 100 }),
    check("goal", "Sprint goal must not exceed 500 characters")
      .optional()
      .isLength({ max: 500 }),
    check("startDate", "Valid start date is required")
      .notEmpty()
      .isISO8601()
      .toDate(),
    check("endDate", "Valid end date is required")
      .notEmpty()
      .isISO8601()
      .toDate(),
    check("status", "Invalid sprint status")
      .optional()
      .isIn(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { name, goal, startDate, endDate, status } = req.body;

    const sprint = await createSprint(
      projectId,
      {
        name: name.trim(),
        goal: goal?.trim(),
        startDate,
        endDate,
        status,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: sprint,
      message: "Sprint created successfully",
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/sprints
 * @desc    Get all sprints for a project with optional status filter
 * @access  Private - Requires project.view permission
 */
router.get(
  "/projects/:projectId/sprints",
  authenticate,
  checkProjectPermission("project.view"),
  [
    check("status", "Invalid sprint status")
      .optional()
      .isIn(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { status } = req.query;

    const sprints = await getProjectSprints(projectId, status as any);

    res.status(200).json({
      success: true,
      data: sprints,
      count: sprints.length,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/sprints/active
 * @desc    Get the active sprint for a project
 * @access  Private - Requires project.view permission
 */
router.get(
  "/projects/:projectId/sprints/active",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const activeSprint = await getActiveSprint(projectId);

    res.status(200).json({
      success: true,
      data: activeSprint,
    });
  })
);

/**
 * @route   GET /api/sprints/:sprintId
 * @desc    Get sprint details by ID
 * @access  Private - Requires project.view permission
 */
router.get(
  "/sprints/:sprintId",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const sprint = await getSprintById(sprintId);

    res.status(200).json({
      success: true,
      data: sprint,
    });
  })
);

/**
 * @route   GET /api/sprints/:sprintId/board
 * @desc    Get sprint tasks grouped by status for Kanban board
 * @access  Private - Requires project.view permission
 */
router.get(
  "/sprints/:sprintId/board",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const sprintBoard = await getSprintTasksGrouped(sprintId);

    res.status(200).json({
      success: true,
      data: sprintBoard,
    });
  })
);

/**
 * @route   PUT /api/sprints/:sprintId
 * @desc    Update sprint details
 * @access  Private - Requires sprint.edit permission
 */
router.put(
  "/sprints/:sprintId",
  authenticate,
  checkProjectPermission("sprint.edit"),
  [
    check("name", "Sprint name must be between 1 and 100 characters")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 }),
    check("goal", "Sprint goal must not exceed 500 characters")
      .optional()
      .isLength({ max: 500 }),
    check("startDate", "Invalid start date")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "Invalid end date")
      .optional()
      .isISO8601()
      .toDate(),
    check("status", "Invalid sprint status")
      .optional()
      .isIn(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;
    const { name, goal, startDate, endDate, status } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (goal !== undefined) updateData.goal = goal?.trim();
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (status !== undefined) updateData.status = status;

    const sprint = await updateSprint(sprintId, updateData, req.user!.userId);

    res.status(200).json({
      success: true,
      data: sprint,
      message: "Sprint updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/sprints/:sprintId
 * @desc    Delete a sprint
 * @access  Private - Requires sprint.delete permission
 */
router.delete(
  "/sprints/:sprintId",
  authenticate,
  checkProjectPermission("sprint.delete"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    await deleteSprint(sprintId, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Sprint deleted successfully",
    });
  })
);

/**
 * @route   POST /api/sprints/:sprintId/start
 * @desc    Start a sprint (change status to ACTIVE)
 * @access  Private - Requires sprint.start permission
 */
router.post(
  "/sprints/:sprintId/start",
  authenticate,
  checkProjectPermission("sprint.start"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const sprint = await startSprint(sprintId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: sprint,
      message: "Sprint started successfully",
    });
  })
);

/**
 * @route   POST /api/sprints/:sprintId/complete
 * @desc    Complete a sprint and move incomplete tasks to backlog
 * @access  Private - Requires sprint.complete permission
 */
router.post(
  "/sprints/:sprintId/complete",
  authenticate,
  checkProjectPermission("sprint.complete"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const sprint = await completeSprint(sprintId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: sprint,
      message: "Sprint completed successfully. Incomplete tasks moved to backlog.",
    });
  })
);

/**
 * @route   POST /api/sprints/:sprintId/move-incomplete-tasks
 * @desc    Move incomplete tasks from sprint back to backlog
 * @access  Private - Requires sprint.edit permission
 */
router.post(
  "/sprints/:sprintId/move-incomplete-tasks",
  authenticate,
  checkProjectPermission("sprint.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    await moveIncompleteTasksToBacklog(sprintId, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Incomplete tasks moved to backlog successfully",
    });
  })
);

/**
 * @route   GET /api/sprints/:sprintId/stats
 * @desc    Get sprint statistics and analytics
 * @access  Private - Requires project.view permission
 */
router.get(
  "/sprints/:sprintId/stats",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const stats = await getSprintStats(sprintId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

export default router;