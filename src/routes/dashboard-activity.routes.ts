import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  getDashboardActivities,
  getActivityStats,
  getRecentActivitySummary,
} from "../services/dashboard-activity.service";

const router = Router();

/**
 * @route   GET /api/dashboard/activities
 * @desc    Get unified activity feed for dashboard (all system activities)
 * @access  Private - Admin sees all, Project Manager sees their projects only
 *
 * @queryParams
 *   - userId: Filter by specific user (optional)
 *   - entityType: Filter by entity type - PROJECT, TASK, USER, etc. (optional)
 *   - entityId: Filter by specific entity ID (optional)
 *   - startDate: Start date for date range filter (ISO 8601 format)
 *   - endDate: End date for date range filter (ISO 8601 format)
 *   - search: Search in descriptions and names (optional)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 100)
 *
 * @example
 *   GET /api/dashboard/activities?page=1&limit=50
 *   GET /api/dashboard/activities?userId=user-uuid&startDate=2025-12-01
 *   GET /api/dashboard/activities?entityType=PROJECT&search=budget
 */
router.get(
  "/activities",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER"]),
  [
    check("userId", "Invalid user ID format").optional().isUUID(),
    check("entityType", "Invalid entity type")
      .optional()
      .isIn([
        "USER",
        "PROJECT",
        "TASK",
        "FILE",
        "SPRINT",
        "BACKLOG_ITEM",
        "BUDGET",
        "EXPENSE",
        "SETTING",
        "PERMISSION",
        "PROJECT_MEMBER",
        "TASK_ASSIGNMENT",
      ]),
    check("entityId", "Invalid entity ID format").optional().isUUID(),
    check("startDate", "Invalid start date format")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "Invalid end date format").optional().isISO8601().toDate(),
    check("search", "Search query must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
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
    const {
      userId,
      entityType,
      entityId,
      startDate,
      endDate,
      search,
      page,
      limit,
    } = req.query;

    const result = await getDashboardActivities(
      {
        userId,
        entityType,
        entityId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        search,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: result.activities,
      pagination: result.pagination,
      summary: result.summary,
    });
  })
);

/**
 * @route   GET /api/dashboard/activities/stats
 * @desc    Get activity statistics for dashboard
 * @access  Private - Admin sees all, Project Manager sees their projects only
 *
 * @queryParams
 *   - timeframe: today | week | month | year (default: week)
 *
 * @example
 *   GET /api/dashboard/activities/stats?timeframe=week
 */
router.get(
  "/activities/stats",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER"]),
  [
    check("timeframe", "Invalid timeframe")
      .optional()
      .isIn(["today", "week", "month", "year"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { timeframe = "week" } = req.query;

    const stats = await getActivityStats(
      timeframe as "today" | "week" | "month" | "year",
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/dashboard/activities/recent
 * @desc    Get recent activity summary (last 24 hours, top 10)
 * @access  Private - Admin sees all, Project Manager sees their projects only
 *
 * @example
 *   GET /api/dashboard/activities/recent
 */
router.get(
  "/activities/recent",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const summary = await getRecentActivitySummary(
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

/**
 * @route   GET /api/dashboard/activities/export
 * @desc    Export activity feed to CSV
 * @access  Private - Admin only
 *
 * @queryParams (same as GET /activities)
 *
 * @example
 *   GET /api/dashboard/activities/export?startDate=2025-11-01
 */
router.get(
  "/activities/export",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("userId", "Invalid user ID format").optional().isUUID(),
    check("entityType", "Invalid entity type")
      .optional()
      .isIn([
        "USER",
        "PROJECT",
        "TASK",
        "FILE",
        "SPRINT",
        "BACKLOG_ITEM",
        "BUDGET",
        "EXPENSE",
        "SETTING",
        "PERMISSION",
      ]),
    check("entityId", "Invalid entity ID format").optional().isUUID(),
    check("startDate", "Invalid start date format")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "Invalid end date format").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { userId, entityType, entityId, startDate, endDate } = req.query;

    // Get all activities (no pagination for export)
    const result = await getDashboardActivities(
      {
        userId,
        entityType,
        entityId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: 10000, // Large limit for export
      },
      req.user!.userId,
      req.user!.role
    );

    // Convert to CSV
    const csvHeaders = [
      "Timestamp",
      "Type",
      "Action",
      "User Name",
      "User Email",
      "Staff ID",
      "Entity Type",
      "Entity Name",
      "Description",
      "Project",
      "IP Address",
    ];

    const csvRows = result.activities.map((activity) => [
      activity.timestamp.toISOString(),
      activity.type,
      activity.action,
      activity.user.name,
      activity.user.email,
      activity.user.staffId || "",
      activity.entity.type,
      activity.entity.name || "",
      activity.description,
      activity.metadata?.projectName || "",
      activity.metadata?.ipAddress || "",
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Set headers for file download
    const filename = `system-activities-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.status(200).send(csvContent);
  })
);

/**
 * @route   GET /api/dashboard/activities/user/:userId
 * @desc    Get activity history for a specific user
 * @access  Private - Admin only
 *
 * @example
 *   GET /api/dashboard/activities/user/user-uuid?page=1&limit=50
 */
router.get(
  "/activities/user/:userId",
  authenticate,
  authorize(["ADMIN"]),
  [
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
    const { userId } = req.params;
    const { page, limit } = req.query;

    const result = await getDashboardActivities(
      {
        userId,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: result.activities,
      pagination: result.pagination,
      summary: result.summary,
    });
  })
);

/**
 * @route   GET /api/dashboard/activities/project/:projectId
 * @desc    Get all activities for a specific project
 * @access  Private - Admin or Project Manager (if member)
 *
 * @example
 *   GET /api/dashboard/activities/project/project-uuid?page=1&limit=50
 */
router.get(
  "/activities/project/:projectId",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER"]),
  [
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
    const { projectId } = req.params;
    const { page, limit } = req.query;

    // Check if user has access to this project (for PROJECT_MANAGER)
    if (req.user!.role === "PROJECT_MANAGER") {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      const membership = await prisma.projectMember.findFirst({
        where: {
          userId: req.user!.userId,
          projectId,
        },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this project",
        });
      }
    }

    const result = await getDashboardActivities(
      {
        entityType: "PROJECT",
        entityId: projectId,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: result.activities,
      pagination: result.pagination,
      summary: result.summary,
    });
  })
);

export default router;
