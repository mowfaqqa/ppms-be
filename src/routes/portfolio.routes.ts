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
} from "../services/portfolio.service";

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
  [check("name", "Name is required").notEmpty(), validate],
  asyncHandler(async (req: any, res: any) => {
    const { name, description, startDate, endDate, status } = req.body;

    const portfolio = await createPortfolio({
      name,
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
 * @desc    Get all portfolios
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const portfolios = await getAllPortfolios();

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

    const portfolio = await getPortfolioById(id);

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   PUT /api/portfolios/:id
 * @desc    Update portfolio
 * @access  Private/Admin
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name must not be empty if provided").optional().notEmpty(),
    check("year", "Year must be a number if provided").optional().isInt(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, year, description } = req.body;

    const portfolio = await updatePortfolio(id, {
      name,
      year,
      description,
    });

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   DELETE /api/portfolios/:id
 * @desc    Delete portfolio
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deletePortfolio(id);

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

    const stats = await getPortfolioStats(id);

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
    const stats = await getPortfolioStats(id);

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
    const projects = await getAllPortfolioProjects(portfolioId);

    res.status(200).json({
      success: true,
      data: projects,
    });
  })
);

export default router;
