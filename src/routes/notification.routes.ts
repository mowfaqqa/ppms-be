// routes/notification.routes.ts - Complete Notification Routes
import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import {
  getUserNotifications,
  getNotificationCounts,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  deleteAllNotifications,
  createSystemAnnouncement,
} from "../services/notification.service";

const router = Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for authenticated user
 * @access  Private
 *
 * @queryParams
 *   - read: Filter by read status (true/false)
 *   - type: Filter by notification type
 *   - priority: Filter by priority (LOW, NORMAL, HIGH, URGENT)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20, max: 100)
 *
 * @example
 *   GET /api/notifications?read=false&page=1&limit=20
 */
router.get(
  "/",
  authenticate,
  [
    check("read", "Read must be a boolean").optional().isBoolean().toBoolean(),
    check("type", "Invalid notification type").optional().isString(),
    check("priority", "Invalid priority")
      .optional()
      .isIn(["LOW", "NORMAL", "HIGH", "URGENT"]),
    check("page", "Page must be a positive integer")
      .optional()
      .isInt({ min: 1 })
      .toInt(),
    check("limit", "Limit must be between 1 and 100")
      .optional()
      .isInt({ min: 1, max: 100 })
      .toInt(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { read, type, priority, page, limit } = req.query;

    const result = await getUserNotifications(req.user!.userId, {
      read,
      type,
      priority,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
    });
  })
);

/**
 * @route   GET /api/notifications/counts
 * @desc    Get notification counts (unread, total, urgent)
 * @access  Private
 *
 * @example
 *   GET /api/notifications/counts
 *
 * @returns
 *   {
 *     unreadCount: 5,
 *     totalCount: 50,
 *     urgentCount: 2
 *   }
 */
router.get(
  "/counts",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const counts = await getNotificationCounts(req.user!.userId);

    res.status(200).json({
      success: true,
      data: counts,
    });
  })
);

/**
 * @route   GET /api/notifications/unread
 * @desc    Get only unread notifications
 * @access  Private
 *
 * @queryParams
 *   - limit: Items per page (default: 20)
 *
 * @example
 *   GET /api/notifications/unread?limit=10
 */
router.get(
  "/unread",
  authenticate,
  [
    check("limit", "Limit must be between 1 and 100")
      .optional()
      .isInt({ min: 1, max: 100 })
      .toInt(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { limit } = req.query;

    const limitValue= Number(limit) || 10;

    const result = await getUserNotifications(req.user!.userId, {
      read: false,
      limit: limitValue,
      page: 1,
    });

    res.status(200).json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
    });
  })
);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 *
 * @example
 *   PATCH /api/notifications/notification-uuid/read
 */
router.patch(
  "/:id/read",
  authenticate,
  [check("id", "Invalid notification ID"), validate],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const notification = await markAsRead(id, req.user!.userId);

    res.status(200).json({
      success: true,
      data: notification,
      message: "Notification marked as read",
    });
  })
);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 *
 * @example
 *   PATCH /api/notifications/read-all
 */
router.patch(
  "/read-all",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const result = await markAllAsRead(req.user!.userId);

    res.status(200).json({
      success: true,
      message: `Marked ${result.count} notifications as read`,
      data: { count: result.count },
    });
  })
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 *
 * @example
 *   DELETE /api/notifications/notification-uuid
 */
router.delete(
  "/:id",
  authenticate,
  [check("id", "Invalid notification ID"), validate],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteNotification(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  })
);

/**
 * @route   DELETE /api/notifications/read
 * @desc    Delete all read notifications
 * @access  Private
 *
 * @example
 *   DELETE /api/notifications/read
 */
router.delete(
  "/read",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const result = await deleteReadNotifications(req.user!.userId);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.count} read notifications`,
      data: { count: result.count },
    });
  })
);

/**
 * @route   DELETE /api/notifications/all
 * @desc    Delete all notifications for user
 * @access  Private
 *
 * @example
 *   DELETE /api/notifications/all
 */
router.delete(
  "/all",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const result = await deleteAllNotifications(req.user!.userId);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.count} notifications`,
      data: { count: result.count },
    });
  })
);

/**
 * @route   POST /api/notifications/announcement
 * @desc    Create system announcement (Admin only)
 * @access  Private - Admin only
 *
 * @body
 *   - title: Announcement title (required)
 *   - message: Announcement message (required)
 *   - priority: Priority level (optional, default: NORMAL)
 *
 * @example
 *   POST /api/notifications/announcement
 *   {
 *     "title": "System Maintenance",
 *     "message": "System will be down for maintenance on...",
 *     "priority": "HIGH"
 *   }
 */
router.post(
  "/announcement",
  authenticate,
  [
    check("title", "Title is required").notEmpty().isLength({ max: 200 }),
    check("message", "Message is required").notEmpty(),
    check("priority", "Invalid priority")
      .optional()
      .isIn(["LOW", "NORMAL", "HIGH", "URGENT"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    // Check if user is admin
    if (req.user!.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create system announcements",
      });
    }

    const { title, message, priority } = req.body;

    await createSystemAnnouncement(title, message, priority || "NORMAL");

    res.status(201).json({
      success: true,
      message: "System announcement sent to all active users",
    });
  })
);

/**
 * @route   GET /api/notifications/test
 * @desc    Create a test notification (Development only)
 * @access  Private
 *
 * @example
 *   GET /api/notifications/test
 */
router.get(
  "/test",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({
        success: false,
        message: "Test endpoint not available in production",
      });
    }

    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    const notification = await prisma.notification.create({
      data: {
        userId: req.user!.userId,
        type: "TASK_ASSIGNED",
        title: "Test Notification",
        message: "This is a test notification to verify the system is working",
        priority: "NORMAL",
      },
    });

    await prisma.$disconnect();

    res.status(201).json({
      success: true,
      message: "Test notification created",
      data: notification,
    });
  })
);

export default router;
