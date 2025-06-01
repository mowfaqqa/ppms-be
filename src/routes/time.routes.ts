import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { checkTaskPermission } from "../middleware/permission.middleware";
import {
  startTimeEntry,
  stopTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getUserTimeEntries,
  getActiveTimeEntry,
  getTaskTimeEntries,
  getTaskTimeSummary,
  getProjectTimeSummary,
} from "../services/time.service";

const router = Router();

/**
 * @route   POST /api/time/start
 * @desc    Start time entry
 * @access  Private
 */
router.post(
  "/start",
  authenticate,
  [check("taskId", "Task ID is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { taskId, description } = req.body;

    const timeEntry = await startTimeEntry(
      {
        taskId,
        description,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   PUT /api/time/:id/stop
 * @desc    Stop time entry
 * @access  Private
 */
router.put(
  "/:id/stop",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const timeEntry = await stopTimeEntry(id, req.user!.userId);

    res.status(200).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   PUT /api/time/:id
 * @desc    Update time entry
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  [
    check("startTime", "Start time must be valid")
      .optional()
      .isISO8601()
      .toDate(),
    check("endTime", "End time must be valid").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { startTime, endTime, description } = req.body;

    const timeEntry = await updateTimeEntry(
      id,
      {
        startTime,
        endTime,
        description,
      },
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   DELETE /api/time/:id
 * @desc    Delete time entry
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteTimeEntry(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Time entry deleted successfully",
    });
  })
);

/**
 * @route   GET /api/time/user
 * @desc    Get current user's time entries
 * @access  Private
 */
router.get(
  "/user",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { taskId, projectId, startDate, endDate } = req.query;

    const timeEntries = await getUserTimeEntries(req.user!.userId, {
      taskId: taskId as string,
      projectId: projectId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: timeEntries,
    });
  })
);

/**
 * @route   GET /api/time/active
 * @desc    Get current user's active time entry
 * @access  Private
 */
router.get(
  "/active",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const timeEntry = await getActiveTimeEntry(req.user!.userId);

    res.status(200).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   GET /api/time/task/:taskId
 * @desc    Get time entries for a task
 * @access  Private
 */
router.get(
  "/task/:taskId",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const timeEntries = await getTaskTimeEntries(taskId);

    res.status(200).json({
      success: true,
      data: timeEntries,
    });
  })
);

/**
 * @route   GET /api/time/task/:taskId/summary
 * @desc    Get time summary for a task
 * @access  Private
 */
router.get(
  "/task/:taskId/summary",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const summary = await getTaskTimeSummary(taskId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

/**
 * @route   GET /api/time/project/:projectId/summary
 * @desc    Get time summary for a project
 * @access  Private
 */
router.get(
  "/project/:projectId/summary",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const summary = await getProjectTimeSummary(projectId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

export default router;
