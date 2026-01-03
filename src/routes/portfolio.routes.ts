import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createPortfolio,
  getAllPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
  getPortfolioStats,
  getPortfolioPrograms,
  getAllPortfolioProjectsIncludingPrograms,
} from "../services/portfolio.service";
import { auditLog } from "../middleware/audit.middleware";
import { AuditAction, EntityType } from "@prisma/client";

const router = Router();

/**
 * @route   POST /api/portfolios
 * @desc    Create a new portfolio
 * @access  Private/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name is required").notEmpty(),
    check("yearId", "Year ID is required").notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { name, yearId, description, startDate, endDate, status } = req.body;

    const portfolio = await createPortfolio({
      name,
      yearId,
      description,
      startDate,
      endDate,
      status,
    });

    res.status(201).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   GET /api/portfolios
 * @desc    Get all portfolios with optional filters
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  [
    check("yearId", "Invalid year ID format").optional(),
    check("search", "Search query must not exceed 100 characters")
      .optional()
      .isLength({ max: 100 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { yearId, status, search } = req.query;

    const portfolios = await getAllPortfolios(
      req.user.userId, 
      req.user.role, 
      {
        yearId: yearId as string,
        status: status as string,
        search: search as string,
    });

    res.status(200).json({
      success: true,
      data: portfolios,
    });
  })
);

/**
 * @route   GET /api/portfolios/:id
 * @desc    Get portfolio by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const portfolio = await getPortfolioById(
      id,
      req.user.role,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   PUT /api/portfolios/:id
 * @desc    Update portfolio
 * @access  Private/Admin/Program Manager
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  [
    check("name", "Name must not be empty if provided").optional().notEmpty(),
    check("yearId", "Invalid year ID format").optional(),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.PORTFOLIO,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, yearId, description, startDate, endDate, status } = req.body;

    const portfolio = await updatePortfolio(
      id,
      {
        name,
        yearId,
        description,
        startDate,
        endDate,
        status,
      },
      req.user.role,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      data: portfolio,
      message: "Portfolio updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/portfolios/:id
 * @desc    Delete portfolio (cascades to all programs, projects, tasks)
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.PORTFOLIO,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deletePortfolio(
      id,
      req.user.role,
      req.user.userId,
    );
    

    res.status(200).json({
      success: true,
      message: "Portfolio deleted successfully",
    });
  })
);

/**
 * @route   GET /api/portfolios/:id/stats
 * @desc    Get portfolio statistics
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stats = await getPortfolioStats(
      id,
      req.user.role,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);
/**
 * @route   GET /api/portfolios/:id/analytics
 * @desc    Get comprehensive portfolio analytics
 * @access  Private
 */
router.get(
  "/:id/analytics",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { PrismaClient } = await import("@prisma/client");
    const { ApiError, HttpStatus } = await import("../utils/error.utils");
    const prisma = new PrismaClient();

    // Get basic stats
    const stats = await getPortfolioStats(
      id,
      req.user.role,
      req.user.userId,
    );
    
    // Get additional portfolio data for detailed analytics
    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: {
        projects: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!portfolio) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
    }

    const onTimeProjects = portfolio.projects.filter((project) => {
      const now = new Date();
      const endDate = new Date(project.endDate);
      return project.status === "COMPLETED" || now <= endDate;
    }).length;

    const totalProjects = portfolio.projects.length;
    const onTimeProjectsPercentage =
      totalProjects > 0 ? (onTimeProjects / totalProjects) * 100 : 100;

    // Count active issues
    let activeIssues = 0;
    const now = new Date();
    portfolio.projects.forEach((project) => {
      const isOverdue =
        now > new Date(project.endDate) && project.status !== "COMPLETED";

      if (isOverdue) {
        activeIssues++;
      }
    });

    const analytics = {
      activeProjects: stats.projects?.IN_PROGRESS || 0,
      completedProjects: stats.projects?.COMPLETED || 0,
      totalTeamMembers: new Set(
        portfolio.projects.flatMap((project) =>
          project.members.map((member) => member.userId)
        )
      ).size,
      onTimeProjects,
      onTimeProjectsPercentage:
        Math.round(onTimeProjectsPercentage * 100) / 100,
      activeIssues,
      totalProjects,
    };

    res.status(200).json({
      success: true,
      data: analytics,
    });
  })
);

/**
 * @route   GET /api/portfolios/:id/projects
 * @desc    Get projects for a specific portfolio
 * @access  Private
 */
router.get(
  "/:id/projects",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id: portfolioId } = req.params;
    const { getAllPortfolioProjects } = await import(
      "../services/portfolio.service"
    );
    const projects = await getAllPortfolioProjects(
      portfolioId,
      req.user.role,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      data: projects,
    });
  })
);
/**
 * @route   GET /api/portfolios/:id/projects/all
 * @desc    Get all projects for a portfolio (including those in programs)
 * @access  Private
 */
router.get(
  "/:id/projects/all",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id: portfolioId } = req.params;

    const projects = await getAllPortfolioProjectsIncludingPrograms(
      portfolioId,
      req.user.role,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      data: projects,
      message: "All projects including those in programs",
    });
  })
);
/**
 * @route   GET /api/portfolios/:id/programs
 * @desc    Get all programs for a portfolio
 * @access  Private
 */
router.get(
  "/:id/programs",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id: portfolioId } = req.params;

    const programs = await getPortfolioPrograms(
      portfolioId,
      req.user.role,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      data: programs,
    });
  })
);
export default router;
