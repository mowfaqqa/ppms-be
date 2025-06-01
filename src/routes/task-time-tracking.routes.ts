import { Router } from 'express';
import { check } from 'express-validator';
import { asyncHandler } from '../utils/common.utils';
import { validate } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { checkTaskPermission } from '../middleware/permission.middleware';
import {
  getTaskTimeEntries,
  getTaskTimeSummary,
  startTimeTracking,
  stopTimeTracking,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from '../services/task-time-tracking.service';

const router = Router();

/**
 * @route   GET /api/tasks/:taskId/time-entries
 * @desc    Get task time entries
 * @access  Private
 */
router.get(
  '/:taskId/time-entries',
  authenticate,
  checkTaskPermission('task.view'),
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
 * @route   GET /api/tasks/:taskId/time-summary
 * @desc    Get task time summary
 * @access  Private
 */
router.get(
  '/:taskId/time-summary',
  authenticate,
  checkTaskPermission('task.view'),
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
 * @route   POST /api/tasks/:taskId/time-entries/start
 * @desc    Start time tracking
 * @access  Private
 */
router.post(
  '/:taskId/time-entries/start',
  authenticate,
  checkTaskPermission('task.view'),
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    
    const timeEntry = await startTimeTracking(taskId, req.user!.userId);
    
    res.status(201).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/time-entries/stop
 * @desc    Stop time tracking
 * @access  Private
 */
router.post(
  '/:taskId/time-entries/stop',
  authenticate,
  checkTaskPermission('task.view'),
  [
    check('description', 'Description is required').optional().notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { description } = req.body;
    
    const timeEntry = await stopTimeTracking(taskId, req.user!.userId, description);
    
    res.status(200).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   POST /api/tasks/:taskId/time-entries
 * @desc    Create manual time entry
 * @access  Private
 */
router.post(
  '/:taskId/time-entries',
  authenticate,
  checkTaskPermission('task.view'),
  [
    check('description', 'Description is required').notEmpty(),
    check('startTime', 'Start time is required').isISO8601().toDate(),
    check('endTime', 'End time is required').isISO8601().toDate(),
    check('duration', 'Duration must be a number').isNumeric(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { taskId } = req.params;
    const { description, startTime, endTime, duration } = req.body;
    
    const timeEntry = await createTimeEntry(
      taskId,
      req.user!.userId,
      {
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        duration: parseInt(duration),
      }
    );
    
    res.status(201).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   PATCH /api/tasks/:taskId/time-entries/:entryId
 * @desc    Update time entry
 * @access  Private
 */
router.patch(
  '/:taskId/time-entries/:entryId',
  authenticate,
  checkTaskPermission('task.view'),
  [
    check('description', 'Description is required').optional().notEmpty(),
    check('startTime', 'Start time must be valid').optional().isISO8601().toDate(),
    check('endTime', 'End time must be valid').optional().isISO8601().toDate(),
    check('duration', 'Duration must be a number').optional().isNumeric(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { entryId } = req.params;
    const { description, startTime, endTime, duration } = req.body;
    
    const timeEntry = await updateTimeEntry(
      entryId,
      req.user!.userId,
      {
        description,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        duration: duration ? parseInt(duration) : undefined,
      }
    );
    
    res.status(200).json({
      success: true,
      data: timeEntry,
    });
  })
);

/**
 * @route   DELETE /api/tasks/:taskId/time-entries/:entryId
 * @desc    Delete time entry
 * @access  Private
 */
router.delete(
  '/:taskId/time-entries/:entryId',
  authenticate,
  checkTaskPermission('task.view'),
  asyncHandler(async (req: any, res: any) => {
    const { entryId } = req.params;
    
    await deleteTimeEntry(entryId, req.user!.userId);
    
    res.status(200).json({
      success: true,
      message: 'Time entry deleted successfully',
    });
  })
);

export default router;