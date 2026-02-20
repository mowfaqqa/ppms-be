import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { checkProjectPermission } from "../middleware/permission.middleware";
import {
  createBacklogItem,
  getProductBacklog,
  getSprintBacklog,
  getAllBacklogItems,
  getBacklogItemById,
  updateBacklogItem,
  deleteBacklogItem,
  reorderBacklogItems,
  moveItemToSprint,
  moveItemToBacklog,
  createTaskFromBacklogItem,
  getBacklogStats,
} from "../services/backlog.service";

const router = Router();

/**
 * @route   POST /api/projects/:projectId/backlog
 * @desc    Create a new backlog item for a project
 * @access  Private - Requires backlog.create permission
 */
router.post(
  "/projects/:projectId/backlog",
  authenticate,
  checkProjectPermission("backlog.create"),
  [
    check("title", "Backlog item title is required").notEmpty().trim(),
    check("title", "Title must be between 1 and 200 characters").isLength({
      min: 1,
      max: 200,
    }),
    check("description", "Description must not exceed 2000 characters")
      .optional()
      .isLength({ max: 2000 }),
    check("priority", "Priority must be a positive integer")
      .optional()
      .isInt({ min: 0 }),
    check("status", "Invalid backlog item status")
      .optional()
      .isIn(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { title, description, priority, status } = req.body;

    const backlogItem = await createBacklogItem(
      projectId,
      {
        title: title.trim(),
        description: description?.trim(),
        priority,
        status,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: backlogItem,
      message: "Backlog item created successfully",
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/backlog
 * @desc    Get product backlog (items not in any sprint)
 * @access  Private - Requires project.view permission
 */
router.get(
  "/projects/:projectId/backlog",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const backlogItems = await getProductBacklog(projectId);

    res.status(200).json({
      success: true,
      data: backlogItems,
      count: backlogItems.length,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/backlog/all
 * @desc    Get all backlog items for a project with optional filters
 * @access  Private - Requires project.view permission
 */
router.get(
  "/projects/:projectId/backlog/all",
  authenticate,
  checkProjectPermission("project.view"),
  [
    check("status", "Invalid backlog item status")
      .optional()
      .isIn(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
    check("sprintId", "Invalid sprint ID format")
      .optional()
      .custom((value) => {
        if (value === "null") return true; // Allow "null" string for product backlog
        return typeof value === "string" && value.length > 0;
      }),
    check("search", "Search query must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { status, sprintId, search } = req.query;

    const filters: any = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (sprintId !== undefined) {
      filters.sprintId = sprintId === "null" ? null : sprintId;
    }

    const backlogItems = await getAllBacklogItems(projectId, filters);

    res.status(200).json({
      success: true,
      data: backlogItems,
      count: backlogItems.length,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/backlog/stats
 * @desc    Get backlog statistics for a project
 * @access  Private - Requires project.view permission
 */
router.get(
  "/projects/:projectId/backlog/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER","PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const stats = await getBacklogStats(projectId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/sprints/:sprintId/backlog
 * @desc    Get sprint backlog (items assigned to a specific sprint)
 * @access  Private - Requires project.view permission
 */
router.get(
  "/sprints/:sprintId/backlog",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;

    const backlogItems = await getSprintBacklog(sprintId);

    res.status(200).json({
      success: true,
      data: backlogItems,
      count: backlogItems.length,
    });
  })
);

/**
 * @route   GET /api/backlog/:itemId
 * @desc    Get backlog item details by ID
 * @access  Private - Requires project.view permission
 */
router.get(
  "/backlog/:itemId",
  authenticate,
  checkProjectPermission("project.view"),
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;

    const backlogItem = await getBacklogItemById(itemId);

    res.status(200).json({
      success: true,
      data: backlogItem,
    });
  })
);

/**
 * @route   PUT /api/backlog/:itemId
 * @desc    Update backlog item details
 * @access  Private - Requires backlog.edit permission
 */
router.put(
  "/backlog/:itemId",
  authenticate,
  checkProjectPermission("backlog.edit"),
  [
    check("title", "Title must be between 1 and 200 characters")
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 }),
    check("description", "Description must not exceed 2000 characters")
      .optional()
      .isLength({ max: 2000 }),
    check("priority", "Priority must be a positive integer")
      .optional()
      .isInt({ min: 0 }),
    check("status", "Invalid backlog item status")
      .optional()
      .isIn(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;
    const { title, description, priority, status } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;

    const backlogItem = await updateBacklogItem(
      itemId,
      updateData,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: backlogItem,
      message: "Backlog item updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/backlog/:itemId
 * @desc    Delete a backlog item
 * @access  Private - Requires backlog.delete permission
 */
router.delete(
  "/backlog/:itemId",
  authenticate,
  checkProjectPermission("backlog.delete"),
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;

    await deleteBacklogItem(itemId, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Backlog item deleted successfully",
    });
  })
);

/**
 * @route   PUT /api/projects/:projectId/backlog/reorder
 * @desc    Reorder backlog items (bulk priority update)
 * @access  Private - Requires backlog.reorder permission
 */
router.put(
  "/projects/:projectId/backlog/reorder",
  authenticate,
  checkProjectPermission("backlog.reorder"),
  [
    check("items", "Items array is required").isArray(),
    check("items.*.id", "Each item must have a valid ID").notEmpty(),
    check("items.*.priority", "Each item must have a valid priority").isInt({
      min: 0,
    }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { items } = req.body;

    await reorderBacklogItems(projectId, items, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Backlog items reordered successfully",
    });
  })
);

/**
 * @route   POST /api/backlog/:itemId/move-to-sprint
 * @desc    Move backlog item to a sprint
 * @access  Private - Requires backlog.edit permission
 */
router.post(
  "/backlog/:itemId/move-to-sprint",
  authenticate,
  checkProjectPermission("backlog.edit"),
  [check("sprintId", "Sprint ID is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;
    const { sprintId } = req.body;

    const backlogItem = await moveItemToSprint(
      itemId,
      sprintId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: backlogItem,
      message: "Backlog item moved to sprint successfully",
    });
  })
);

/**
 * @route   POST /api/backlog/:itemId/move-to-backlog
 * @desc    Move backlog item back to product backlog (remove from sprint)
 * @access  Private - Requires backlog.edit permission
 */
router.post(
  "/backlog/:itemId/move-to-backlog",
  authenticate,
  checkProjectPermission("backlog.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;

    const backlogItem = await moveItemToBacklog(itemId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: backlogItem,
      message: "Backlog item moved to product backlog successfully",
    });
  })
);

/**
 * @route   POST /api/backlog/:itemId/create-task
 * @desc    Create a task from a backlog item
 * @access  Private - Requires task.create permission
 */
router.post(
  "/backlog/:itemId/create-task",
  authenticate,
  checkProjectPermission("task.create"),
  [
    check("title", "Task title must be between 1 and 200 characters")
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 }),
    check("description", "Task description must not exceed 2000 characters")
      .optional()
      .isLength({ max: 2000 }),
    check("priority", "Invalid task priority")
      .optional()
      .isIn(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    check("assigneeIds", "Assignee IDs must be an array").optional().isArray(),
    check("startDate", "Invalid start date").optional().isISO8601().toDate(),
    check("endDate", "Invalid end date").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { itemId } = req.params;
    const { title, description, priority, assigneeIds, startDate, endDate } =
      req.body;

    const taskData: any = {};
    if (title !== undefined) taskData.title = title.trim();
    if (description !== undefined) taskData.description = description?.trim();
    if (priority !== undefined) taskData.priority = priority;
    if (assigneeIds !== undefined) taskData.assigneeIds = assigneeIds;
    if (startDate !== undefined) taskData.startDate = startDate;
    if (endDate !== undefined) taskData.endDate = endDate;

    const task = await createTaskFromBacklogItem(
      itemId,
      taskData,
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: task,
      message: "Task created from backlog item successfully",
    });
  })
);

export default router;
