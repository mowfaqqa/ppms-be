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
  bulkMoveTasksToBacklog,
  bulkMoveTasksToSprint,
  getTasksByBacklogItem,
  getTaskWithBacklogContext,
  moveTaskToSprint,
  moveTaskToBacklog,
  linkTaskToBacklogItem,
  unlinkTaskFromBacklogItem,
  getSprintTasks,
  getBacklogTasks,
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
    const { projectId, status, priority, assigneeId, parentTaskId, search, filter } =
      req.query;

    const tasks = await getAllTasks({
      projectId: projectId as string,
      status: status as any,
      priority: priority as any,
      assigneeId: assigneeId as string,
      parentTaskId: parentTaskId === "null" ? null : (parentTaskId as string),
      search: search as string,
      filter: filter as string,
    }, 
    {
      userId: req.user.userId,
      role: req.user.role,
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
router.patch(
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

    const assignment = await assignTaskToUser(taskId, userId, req.user!.userId);

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

    const comments = await getTaskComments(
      taskId,
      {
        userId: req.user.userId,
        role: req.user.role,
      }
    );

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
/**
 * @route   POST /api/tasks/with-backlog
 * @desc    Create a new task with backlog item support
 * @access  Private
 */
router.post(
  "/with-backlog",
  authenticate,
  checkTaskPermission("task.create"),
  [
    check("title", "Title is required").notEmpty(),
    check("projectId", "Project ID is required").notEmpty(),
    check("backlogItemId", "Invalid backlog item ID").optional().isString(),
    check("sprintId", "Invalid sprint ID").optional().isString(),
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
      backlogItemId,
      sprintId,
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
        backlogItemId,
        sprintId,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: task,
      message: "Task created successfully",
    });
  })
);

/**
 * @route   GET /api/tasks/:taskId/backlog-context
 * @desc    Get task with enhanced backlog context
 * @access  Private
 */
router.get(
  "/:taskId/backlog-context",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const task = await getTaskWithBacklogContext(taskId);

    res.status(200).json({
      success: true,
      data: task,
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/move-to-sprint
 * @desc    Move task to a specific sprint
 * @access  Private
 */
router.post(
  "/:taskId/move-to-sprint",
  authenticate,
  checkTaskPermission("task.edit"),
  [check("sprintId", "Sprint ID is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { sprintId } = req.body;

    const task = await moveTaskToSprint(taskId, sprintId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: task,
      message: "Task moved to sprint successfully",
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/move-to-backlog
 * @desc    Move task back to product backlog
 * @access  Private
 */
router.post(
  "/:taskId/move-to-backlog",
  authenticate,
  checkTaskPermission("task.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const task = await moveTaskToBacklog(taskId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: task,
      message: "Task moved to backlog successfully",
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/link-backlog-item
 * @desc    Link task to a backlog item
 * @access  Private
 */
router.post(
  "/:taskId/link-backlog-item",
  authenticate,
  checkTaskPermission("task.edit"),
  [check("backlogItemId", "Backlog item ID is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { backlogItemId } = req.body;

    const task = await linkTaskToBacklogItem(
      taskId,
      backlogItemId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: task,
      message: "Task linked to backlog item successfully",
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/unlink-backlog-item
 * @desc    Unlink task from its backlog item
 * @access  Private
 */
router.post(
  "/:taskId/unlink-backlog-item",
  authenticate,
  checkTaskPermission("task.edit"),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;

    const task = await unlinkTaskFromBacklogItem(taskId, req.user!.userId);

    res.status(200).json({
      success: true,
      data: task,
      message: "Task unlinked from backlog item successfully",
    });
  })
);

/**
 * @route   GET /api/sprints/:sprintId/tasks
 * @desc    Get all tasks in a specific sprint
 * @access  Private
 */
router.get(
  "/sprints/:sprintId/tasks",
  authenticate,
  checkTaskPermission("task.view"),
  [
    check("status", "Invalid task status")
      .optional()
      .isIn(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"]),
    check("priority", "Invalid task priority")
      .optional()
      .isIn(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    check("assigneeId", "Invalid assignee ID").optional().isString(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { sprintId } = req.params;
    const { status, priority, assigneeId } = req.query;

    const tasks = await getSprintTasks(sprintId, {
      status: status as any,
      priority: priority as any,
      assigneeId: assigneeId as string,
    });

    res.status(200).json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/backlog-tasks
 * @desc    Get all tasks in project backlog (not in any sprint)
 * @access  Private
 */
router.get(
  "/projects/:projectId/backlog-tasks",
  authenticate,
  checkTaskPermission("task.view"),
  [
    check("status", "Invalid task status")
      .optional()
      .isIn(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"]),
    check("priority", "Invalid task priority")
      .optional()
      .isIn(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    check("assigneeId", "Invalid assignee ID").optional().isString(),
    check("hasBacklogItem", "Invalid hasBacklogItem value")
      .optional()
      .isBoolean(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    const { status, priority, assigneeId, hasBacklogItem } = req.query;

    const tasks = await getBacklogTasks(projectId, {
      status: status as any,
      priority: priority as any,
      assigneeId: assigneeId as string,
      hasBacklogItem: hasBacklogItem === "true",
    });

    res.status(200).json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  })
);

/**
 * @route   GET /api/backlog/:backlogItemId/tasks
 * @desc    Get all tasks for a specific backlog item
 * @access  Private
 */
router.get(
  "/backlog/:backlogItemId/tasks",
  authenticate,
  checkTaskPermission("task.view"),
  asyncHandler(async (req: any, res: any) => {
    const { backlogItemId } = req.params;

    const tasks = await getTasksByBacklogItem(backlogItemId);

    res.status(200).json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  })
);

/**
 * @route   POST /api/tasks/bulk-move-to-sprint
 * @desc    Bulk move multiple tasks to a sprint
 * @access  Private
 */
router.post(
  "/bulk-move-to-sprint",
  authenticate,
  checkTaskPermission("task.edit"),
  [
    check("taskIds", "Task IDs array is required").isArray().notEmpty(),
    check("taskIds.*", "Each task ID must be a valid string").isString(),
    check("sprintId", "Sprint ID is required").notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskIds, sprintId } = req.body;

    const result = await bulkMoveTasksToSprint(
      taskIds,
      sprintId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: `${result.movedCount} tasks moved to sprint successfully`,
    });
  })
);

/**
 * @route   POST /api/tasks/bulk-move-to-backlog
 * @desc    Bulk move multiple tasks to backlog
 * @access  Private
 */
router.post(
  "/bulk-move-to-backlog",
  authenticate,
  checkTaskPermission("task.edit"),
  [
    check("taskIds", "Task IDs array is required").isArray().notEmpty(),
    check("taskIds.*", "Each task ID must be a valid string").isString(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskIds } = req.body;

    const result = await bulkMoveTasksToBacklog(taskIds, req.user!.userId);

    res.status(200).json({
      success: true,
      data: result,
      message: `${result.movedCount} tasks moved to backlog successfully`,
    });
  })
);

export default router;
