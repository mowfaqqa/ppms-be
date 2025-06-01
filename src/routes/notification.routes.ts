import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from "../services/notification.service";

const router = Router();

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { read, limit, offset } = req.query;

    const notifications = await getUserNotifications(req.user!.userId, {
      read: read === "true" ? true : read === "false" ? false : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: notifications,
    });
  })
);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  "/:id/read",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const notification = await markNotificationAsRead(id, req.user!.userId);

    res.status(200).json({
      success: true,
      data: notification,
    });
  })
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  "/read-all",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const result = await markAllNotificationsAsRead(req.user!.userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteNotification(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  })
);

export default router;
