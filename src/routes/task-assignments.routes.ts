import { Router } from 'express';
import { check } from 'express-validator';
import { asyncHandler } from '../utils/common.utils';
import { validate } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { checkTaskPermission, checkAssignmentLimit } from '../middleware/permission.middleware';
import {
  getTaskAssignments,
  addTaskAssignment,
  removeTaskAssignment,
  getProjectWorkloads,
} from '../services/task-assignments.service';

const router = Router();

/**
 * @route   GET /api/tasks/:taskId/assignments
 * @desc    Get task assignments
 * @access  Private
 */
router.get(
  '/:taskId/assignments',
  authenticate,
  checkTaskPermission('task.view'),
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
 * @route   POST /api/tasks/:taskId/assignments
 * @desc    Assign user to task - Updated to match existing service
 * @access  Private
 */
router.post(
  '/:taskId/assignments',
  authenticate,
  checkTaskPermission('task.edit'),
  checkAssignmentLimit,
  [
    check('userId', 'User ID is required').notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const assignment = await addTaskAssignment(taskId, userId);
    
    res.status(201).json({
      success: true,
      data: assignment,
    });
  })
);

/**
 * @route   DELETE /api/tasks/:taskId/assignments/:assignmentId
 * @desc    Remove assignment from task - Updated to use assignmentId
 * @access  Private
 */
router.delete(
  '/:taskId/assignments/:assignmentId',
  authenticate,
  checkTaskPermission('task.edit'),
  asyncHandler(async (req: any, res: any) => {
    const { taskId, assignmentId } = req.params;
    
    await removeTaskAssignment(taskId, assignmentId);
    
    res.status(200).json({
      success: true,
      message: 'User unassigned from task successfully',
    });
  })
);

/**
 * @route   GET /api/projects/:projectId/workloads
 * @desc    Get project member workloads
 * @access  Private
 */
router.get(
  '/projects/:projectId/workloads',
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;
    
    const workloads = await getProjectWorkloads(projectId);
    
    res.status(200).json({
      success: true,
      data: workloads,
    });
  })
);

export default router;