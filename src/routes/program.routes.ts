import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createProgram,
  getAllPrograms,
  getProgramById,
  updateProgram,
  deleteProgram,
  getProgramStats,
  getProgramProjects,
  getProgramActivity,
  moveProgramToPortfolio,
} from "../services/program.service";
import { auditLog } from "../middleware/audit.middleware";
import { AuditAction, EntityType } from "@prisma/client";
import { checkProgramPermission } from "../middleware/permission.middleware";

const router = Router();

/**
 * @route   POST /api/programs
 * @desc    Create a new program
 * @access  Private/Admin/Program Manager
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER","PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
  [
    check("name", "Name is required").notEmpty(),
    check("portfolioId", "Portfolio ID is required").notEmpty(),
    check("startDate", "Start date is required")
      .notEmpty()
      .isISO8601()
      .toDate(),
    check("endDate", "End date is required").notEmpty().isISO8601().toDate(),
    validate,
  ],
  auditLog({
    action: AuditAction.CREATED,
    entityType: EntityType.PROGRAM,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { name, description, startDate, endDate, status, portfolioId } =
      req.body;

    const program = await createProgram(
      {
        name,
        description,
        startDate,
        endDate,
        status,
        portfolioId,
      },
      req.user!.userId
    );

    res.status(201).json({
      success: true,
      data: program,
      message: "Program created successfully",
    });
  })
);

/**
 * @route   GET /api/programs
 * @desc    Get all programs with optional filters
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
  [
    check("portfolioId", "Invalid portfolio ID format").optional(),
    check("status", "Invalid status")
      .optional()
      .isIn(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]),
    check("search", "Search query must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { portfolioId, status, search } = req.query;

    const programs = await getAllPrograms({
      portfolioId: portfolioId as string,
      status: status as any,
      search: search as string,
    }, {
      role: req.user.role,
      userId: req.user.userId,
    });

    res.status(200).json({
      success: true,
      data: programs,
    });
  })
);

/**
 * @route   GET /api/programs/:id
 * @desc    Get program by ID with projects
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER", "TEAM_MEMBER", "OBSERVER"]),
  checkProgramPermission(),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const program = await getProgramById(
      id,
      {
        userRole: req.user.role,
        userId: req.user.userId,
      }
    );

    res.status(200).json({
      success: true,
      data: program,
    });
  })
);

/**
 * @route   PUT /api/programs/:id
 * @desc    Update program
 * @access  Private/Admin/Program Manager
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  [
    check("name", "Name must not be empty if provided").optional().notEmpty(),
    check("startDate", "Start date must be valid")
      .optional()
      .isISO8601()
      .toDate(),
    check("endDate", "End date must be valid").optional().isISO8601().toDate(),
    check("status", "Invalid status")
      .optional()
      .isIn(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]),
    check("portfolioId", "Invalid portfolio ID format").optional(),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PROGRAM,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, description, startDate, endDate, status, portfolioId } =
      req.body;

    const program = await updateProgram(
      id,
      {
        name,
        description,
        startDate,
        endDate,
        status,
        portfolioId,
      },
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: program,
      message: "Program updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/programs/:id
 * @desc    Delete program (cascades to all projects and tasks)
 * @access  Private/Admin/Program Manager
 */
router.delete(
  "/:id",
  authenticate,
  checkProgramPermission(),
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PROGRAM,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteProgram(id, req.user!.userId);

    res.status(200).json({
      success: true,
      message: "Program deleted successfully",
    });
  })
);

/**
 * @route   GET /api/programs/:id/stats
 * @desc    Get program statistics
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  checkProgramPermission(),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stats = await getProgramStats(id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/programs/:id/projects
 * @desc    Get all projects under a program
 * @access  Private
 */
router.get(
  "/:id/projects",
  authenticate,
  checkProgramPermission(),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const projects = await getProgramProjects(id);

    res.status(200).json({
      success: true,
      data: projects,
    });
  })
);

/**
 * @route   GET /api/programs/:id/activity
 * @desc    Get program activity log
 * @access  Private
 */
router.get(
  "/:id/activity",
  authenticate,
  checkProgramPermission(),
  [
    check("limit", "Limit must be between 1 and 100")
      .optional()
      .isInt({ min: 1, max: 100 })
      .toInt(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { limit } = req.query;

    const activities = await getProgramActivity(
      id,
      limit ? parseInt(limit as string) : undefined
    );

    res.status(200).json({
      success: true,
      data: activities,
    });
  })
);

/**
 * @route   POST /api/programs/:programId/move
 * @desc    Move program to different portfolio (Admin only)
 * @access  Private/Admin
 */
router.post(
  "/:programId/move",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("targetPortfolioId", "Target portfolio ID is required").notEmpty(),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PROGRAM,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { programId } = req.params;
    const { targetPortfolioId } = req.body;

    const program = await moveProgramToPortfolio(
      programId,
      targetPortfolioId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: program,
      message: "Program moved successfully",
    });
  })
);

/**
 * @route   GET /api/programs/:id/analytics
 * @desc    Get comprehensive program analytics
 * @access  Private
 */
router.get(
  "/:id/analytics",
  authenticate,
  checkProgramPermission(),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // Get basic stats
    const stats = await getProgramStats(id);

    // Get program details
    const program = await getProgramById(id, {
      userRole: req.user.role,
      userId: req.user.userId,
    });

    // Calculate additional metrics
    const now = new Date();
    const onTimeProjects = program.projects.filter((project: any) => {
      const endDate = new Date(project.endDate);
      return project.status === "COMPLETED" || now <= endDate;
    }).length;

    const totalProjects = program.projects.length;
    const onTimeProjectsPercentage =
      totalProjects > 0 ? (onTimeProjects / totalProjects) * 100 : 100;

    // Count overdue projects
    let overdueProjects = 0;
    program.projects.forEach((project: any) => {
      const isOverdue =
        now > new Date(project.endDate) && project.status !== "COMPLETED";
      if (isOverdue) {
        overdueProjects++;
      }
    });

    const analytics = {
      activeProjects: stats.projects.IN_PROGRESS || 0,
      completedProjects: stats.projects.COMPLETED || 0,
      totalProjects,
      onTimeProjects,
      onTimeProjectsPercentage:
        Math.round(onTimeProjectsPercentage * 100) / 100,
      overdueProjects,
      taskCompletionRate: stats.completionRate,
      totalTasks: stats.tasks.total,
      completedTasks: stats.tasks.COMPLETED,
    };

    res.status(200).json({
      success: true,
      data: analytics,
    });
  })
);

export default router;
