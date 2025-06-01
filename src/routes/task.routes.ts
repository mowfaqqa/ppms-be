import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import {
  checkTaskPermission,
  checkAssignmentLimit,
} from "../middleware/permission.middleware";
import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  assignTaskToUser,
  unassignTaskFromUser,
  addTaskDependency,
  removeTaskDependency,
  getTaskActivity,
  createTaskComment,
  getTaskComments,
  updateTaskComment,
  deleteTaskComment,
  getTaskAssignments,
} from "../services/task.service";


const router = Router();

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private
 */
router.post(
  "/",
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
    check("assigneeIds", "Assignee IDs must be an array").optional().isArray(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const {
      title,
      description,
      status,
      priority,
      projectId,
      parentTaskId,
      startDate,
      endDate,
      assigneeIds,
    } = req.body;

    const task = await createTask(
      {
        title,
        description,
        status,
        priority,
        projectId,
        parentTaskId,
        startDate,
        endDate,
        assigneeIds,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: task,
    });
  })
);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks with filters
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId, status, priority, assigneeId, parentTaskId, search } =
      req.query;

    const tasks = await getAllTasks({
      projectId: projectId as string,
      status: status as any,
      priority: priority as any,
      assigneeId: assigneeId as string,
      parentTaskId: parentTaskId === "null" ? null : (parentTaskId as string),
      search: search as string,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  })
);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get task by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const task = await getTaskById(id);

    res.status(200).json({
      success: true,
      data: task,
    });
  })
);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  checkTaskPermission("task.edit"),
  [
    check("title", "Title must not be empty").optional().notEmpty(),
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
      title,
      description,
      status,
      priority,
      startDate,
      endDate,
      parentTaskId,
    } = req.body;

    const task = await updateTask(
      id,
      {
        title,
        description,
        status,
        priority,
        startDate,
        endDate,
        parentTaskId,
      },
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: task,
    });
  })
);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  checkTaskPermission("task.delete"),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteTask(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/assignments
 * @desc    Assign user to task
 * @access  Private
 */
router.post(
  "/:taskId/assignments",
  authenticate,
  checkTaskPermission("task.edit"),
  checkAssignmentLimit,
  [check("userId", "User ID is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { userId } = req.body;

    const assignment = await assignTaskToUser(taskId, userId);

    res.status(201).json({
      success: true,
      data: assignment,
    });
  })
);

/**
 * @route   DELETE /api/tasks/:taskId/assignments/:userId
 * @desc    Unassign user from task
 * @access  Private
 */
router.delete(
  "/:taskId/assignments/:assignmentId",
  authenticate,
  checkTaskPermission("task.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId, assignmentId } = req.params;

    await unassignTaskFromUser(taskId, assignmentId);

    res.status(200).json({
      success: true,
      message: "User unassigned from task successfully",
    });
  })
);

/**
 * @route   GET /api/tasks/:taskId/assignments
 * @desc    Get task assignments
 * @access  Private
 */
router.get(
  "/:taskId/assignments",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const assignments = await getTaskAssignments(taskId);

    res.status(200).json({
      success: true,
      data: assignments,
    });
  })
);
/**
 * @route   POST /api/tasks/:taskId/dependencies
 * @desc    Add task dependency
 * @access  Private
 */
router.post(
  "/:taskId/dependencies",
  authenticate,
  checkTaskPermission("task.edit"),
  [
    check("precedingTaskId", "Preceding task ID is required").notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { precedingTaskId } = req.body;

    const dependency = await addTaskDependency(precedingTaskId, taskId);

    res.status(201).json({
      success: true,
      data: dependency,
    });
  })
);

/**
 * @route   DELETE /api/tasks/:taskId/dependencies/:precedingTaskId
 * @desc    Remove task dependency
 * @access  Private
 */
router.delete(
  "/:taskId/dependencies/:precedingTaskId",
  authenticate,
  checkTaskPermission("task.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId, precedingTaskId } = req.params;

    await removeTaskDependency(precedingTaskId, taskId);

    res.status(200).json({
      success: true,
      message: "Task dependency removed successfully",
    });
  })
);
/**
 * @route   POST /api/tasks/:taskId/comments
 * @desc    Create a new task comment
 * @access  Private
 */
router.post(
  "/:taskId/comments",
  authenticate,
  checkTaskPermission("task.view"),
  [check("content", "Content is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { content } = req.body;

    const comment = await createTaskComment(taskId, req.user!.userId, content);

    res.status(201).json({
      success: true,
      data: comment,
    });
  })
);

/**
 * @route   GET /api/tasks/:taskId/comments
 * @desc    Get all task comments
 * @access  Private
 */
router.get(
  "/:taskId/comments",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const comments = await getTaskComments(taskId);

    res.status(200).json({
      success: true,
      data: comments,
    });
  })
);

/**
 * @route   PATCH /api/tasks/:taskId/comments/:commentId
 * @desc    Update task comment
 * @access  Private
 */
router.patch(
  "/:taskId/comments/:commentId",
  authenticate,
  checkTaskPermission("task.view"),
  [check("content", "Content is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { commentId } = req.params;
    const { content } = req.body;

    const comment = await updateTaskComment(
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
 * @route   DELETE /api/tasks/:taskId/comments/:commentId
 * @desc    Delete task comment
 * @access  Private
 */
router.delete(
  "/:taskId/comments/:commentId",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { commentId } = req.params;

    await deleteTaskComment(commentId, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  })
);

/**
 * @route   GET /api/tasks/:taskId/activity
 * @desc    Get task activity log
 * @access  Private
 */
router.get(
  "/:taskId/activity",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const activities = await getTaskActivity(taskId);

    res.status(200).json({
      success: true,
      data: activities,
    });
  })
);
export default router;
