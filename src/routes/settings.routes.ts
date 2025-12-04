import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { Role } from "@prisma/client";
import {
  createUser,
  getAllUsers,
  getUserDetails,
  updateUserSettings,
  deleteUser,
  reactivateUser,
  getAuditLogs,
  getAuditStats,
  exportAuditLogs,
} from "../services/settings.service";

const router = Router();

// ==================== USER MANAGEMENT ROUTES ====================

/**
 * @route   POST /api/settings/users
 * @desc    Create a new user (Admin only)
 * @access  Private/Admin
 */
router.post(
  "/users",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name is required").notEmpty().trim(),
    check("name", "Name must be between 2 and 100 characters").isLength({
      min: 2,
      max: 100,
    }),
    check("email", "Please include a valid email").isEmail().normalizeEmail(),
    check("staffId", "Staff ID is required").notEmpty().trim(),
    check("staffId", "Staff ID must be alphanumeric").matches(/^[a-zA-Z0-9-_]+$/),
    check("department", "Department must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    check("phoneNumber", "Phone number must be valid")
      .optional()
      .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/),
    check("position", "Position must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    check("role", "Role must be either PROJECT_MANAGER or TEAM_MEMBER")
      .isIn(["PROJECT_MANAGER", "TEAM_MEMBER"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { name, email, staffId, department, phoneNumber, position, role } =
      req.body;

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get("user-agent");

    const user = await createUser(
      {
        name: name.trim(),
        email: email.toLowerCase(),
        staffId: staffId.trim(),
        department: department?.trim(),
        phoneNumber: phoneNumber?.trim(),
        position: position?.trim(),
        role: role as Role,
      },
      req.user!.userId,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: user,
      message: `User created successfully. A temporary password has been sent to ${user.email}`,
    });
  })
);

/**
 * @route   GET /api/settings/users
 * @desc    Get all users with filters and pagination
 * @access  Private/Admin
 */
router.get(
  "/users",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("role", "Invalid role")
      .optional()
      .isIn(["ADMIN", "PROJECT_MANAGER", "TEAM_MEMBER"]),
    check("department", "Department must be a string").optional().isString(),
    check("isActive", "isActive must be a boolean")
      .optional()
      .isBoolean()
      .toBoolean(),
    check("search", "Search must not exceed 100 characters")
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
    const { role, department, isActive, search, page, limit } = req.query;

    const result = await getAllUsers({
      role: role as Role,
      department,
      isActive,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.users,
      pagination: result.pagination,
    });
  })
);

/**
 * @route   GET /api/settings/users/:id
 * @desc    Get user details by ID
 * @access  Private/Admin
 */
router.get(
  "/users/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const user = await getUserDetails(id);

    res.status(200).json({
      success: true,
      data: user,
    });
  })
);

/**
 * @route   PUT /api/settings/users/:id
 * @desc    Update user details
 * @access  Private/Admin
 */
router.put(
  "/users/:id",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name must be between 2 and 100 characters")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }),
    check("email", "Please include a valid email")
      .optional()
      .isEmail()
      .normalizeEmail(),
    check("staffId", "Staff ID must be alphanumeric")
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9-_]+$/),
    check("department", "Department must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    check("phoneNumber", "Phone number must be valid")
      .optional()
      .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/),
    check("position", "Position must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    check("role", "Role must be ADMIN, PROJECT_MANAGER, or TEAM_MEMBER")
      .optional()
      .isIn(["ADMIN", "PROJECT_MANAGER", "TEAM_MEMBER"]),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, email, staffId, department, phoneNumber, position, role } =
      req.body;

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get("user-agent");

    const user = await updateUserSettings(
      id,
      {
        name: name?.trim(),
        email: email?.toLowerCase(),
        staffId: staffId?.trim(),
        department: department?.trim(),
        phoneNumber: phoneNumber?.trim(),
        position: position?.trim(),
        role: role as Role,
      },
      req.user!.userId,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: user,
      message: "User updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/settings/users/:id
 * @desc    Delete (deactivate) user
 * @access  Private/Admin
 */
router.delete(
  "/users/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user!.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get("user-agent");

    await deleteUser(id, req.user!.userId, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: "User deleted successfully. All associated tasks have been unassigned.",
    });
  })
);

/**
 * @route   POST /api/settings/users/:id/reactivate
 * @desc    Reactivate a deactivated user
 * @access  Private/Admin
 */
router.post(
  "/users/:id/reactivate",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get("user-agent");

    const user = await reactivateUser(id, req.user!.userId, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      data: user,
      message: "User reactivated successfully",
    });
  })
);

// ==================== AUDIT TRAIL ROUTES ====================

/**
 * @route   GET /api/settings/audit-trail
 * @desc    Get audit logs with filters
 * @access  Private/Admin or Project Manager (limited scope)
 */
router.get(
  "/audit-trail",
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
        "EXPENSE",
        "SETTING",
        "PERMISSION",
        "PROJECT_MEMBER",
        "TASK_ASSIGNMENT",
      ]),
    check("entityId", "Invalid entity ID format").optional().isUUID(),
    check("action", "Invalid action")
      .optional()
      .isIn([
        "CREATED",
        "UPDATED",
        "DELETED",
        "ASSIGNED",
        "UNASSIGNED",
        "STATUS_CHANGED",
        "PERMISSION_CHANGED",
        "LOGIN",
        "LOGOUT",
        "PASSWORD_CHANGED",
        "UPLOADED",
        "DOWNLOADED",
        "STARTED",
        "COMPLETED",
        "CANCELLED",
      ]),
    check("startDate", "Invalid start date").optional().isISO8601().toDate(),
    check("endDate", "Invalid end date").optional().isISO8601().toDate(),
    check("search", "Search must not exceed 100 characters")
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
      action,
      startDate,
      endDate,
      search,
      page,
      limit,
    } = req.query;

    const result = await getAuditLogs(
      {
        userId,
        entityType,
        entityId,
        action,
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
      data: result.logs,
      pagination: result.pagination,
    });
  })
);

/**
 * @route   GET /api/settings/audit-trail/stats
 * @desc    Get audit trail statistics
 * @access  Private/Admin
 */
router.get(
  "/audit-trail/stats",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("startDate", "Invalid start date").optional().isISO8601().toDate(),
    check("endDate", "Invalid end date").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { startDate, endDate } = req.query;

    const stats = await getAuditStats(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/settings/audit-trail/export
 * @desc    Export audit logs to CSV
 * @access  Private/Admin
 */
router.get(
  "/audit-trail/export",
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
        "EXPENSE",
        "SETTING",
        "PERMISSION",
        "PROJECT_MEMBER",
        "TASK_ASSIGNMENT",
      ]),
    check("action", "Invalid action")
      .optional()
      .isIn([
        "CREATED",
        "UPDATED",
        "DELETED",
        "ASSIGNED",
        "UNASSIGNED",
        "STATUS_CHANGED",
        "PERMISSION_CHANGED",
        "LOGIN",
        "LOGOUT",
        "PASSWORD_CHANGED",
        "UPLOADED",
        "DOWNLOADED",
        "STARTED",
        "COMPLETED",
        "CANCELLED",
      ]),
    check("startDate", "Invalid start date").optional().isISO8601().toDate(),
    check("endDate", "Invalid end date").optional().isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { userId, entityType, action, startDate, endDate } = req.query;

    const csv = await exportAuditLogs({
      userId,
      entityType,
      action,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    // Set headers for file download
    const filename = `audit-trail-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.status(200).send(csv);
  })
);

/**
 * @route   GET /api/settings/departments
 * @desc    Get list of unique departments (for autocomplete/suggestions)
 * @access  Private/Admin
 */
router.get(
  "/departments",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    // Get unique departments from all users
    const users = await prisma.user.findMany({
      where: {
        department: {
          not: null,
        },
      },
      select: {
        department: true,
      },
      distinct: ["department"],
      orderBy: {
        department: "asc",
      },
    });

    const departments = users
      .map((u: any) => u.department)
      .filter((d: any) => d !== null && d.trim() !== "");

    res.status(200).json({
      success: true,
      data: departments,
    });
  })
);

export default router;