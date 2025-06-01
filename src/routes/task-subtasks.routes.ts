import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { checkTaskPermission } from "../middleware/permission.middleware";
import {
  createSubtask,
  getTaskSubtasks,
} from "../services/task-subtasks.service";

const router = Router();

/**
 * @route   GET /api/tasks/:taskId/subtasks
 * @desc    Get task subtasks
 * @access  Private
 */
router.get(
  "/:taskId/subtasks",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const subtasks = await getTaskSubtasks(taskId);

    res.status(200).json({
      success: true,
      data: subtasks,
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/subtasks
 * @desc    Create subtask
 * @access  Private
 */
router.post(
  "/:taskId/subtasks",
  authenticate,
  checkTaskPermission("task.create"),
  [
    check("title", "Title is required").notEmpty(),
    check("projectId", "Project ID is required").notEmpty(),
    check("startDate", "Start date must be valid")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "End date must be valid").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const {
      title,
      description,
      priority = "MEDIUM",
      projectId,
      startDate,
      endDate,
    } = req.body;

    const subtask = await createSubtask(
      {
        title,
        description,
        priority,
        projectId,
        parentTaskId: taskId,
        startDate,
        endDate,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: subtask,
    });
  })
);

export default router;
