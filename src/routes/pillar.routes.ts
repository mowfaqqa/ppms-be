import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createPillar,
  getAllPillars,
  getPillarById,
  updatePillar,
  deletePillar,
  getPillarStats,
} from "../services/pillar.service";
import { getPortfolioStats } from "../services/portfolio.service";
import {
  calculateOverallProgress,
  calculateTimelineHealth,
} from "../utils/analytics";
import { PrismaClient } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const router = Router();

const prisma = new PrismaClient();

/**
 * @route   POST /api/pillars
 * @desc    Create a new pillar
 * @access  Private/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name is required").notEmpty(),
    check("portfolioId", "Portfolio ID is required").notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { name, description, portfolioId } = req.body;

    const pillar = await createPillar({
      name,
      description,
      portfolioId,
    });

    res.status(201).json({
      success: true,
      data: pillar,
    });
  })
);

/**
 * @route   GET /api/pillars
 * @desc    Get all pillars
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { portfolioId } = req.query;

    const pillars = await getAllPillars(portfolioId as string);

    res.status(200).json({
      success: true,
      data: pillars,
    });
  })
);

/**
 * @route   GET /api/pillars/:id
 * @desc    Get pillar by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const pillar = await getPillarById(id);

    res.status(200).json({
      success: true,
      data: pillar,
    });
  })
);

/**
 * @route   PUT /api/pillars/:id
 * @desc    Update pillar
 * @access  Private/Admin
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name must not be empty if provided").optional().notEmpty(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, description, portfolioId } = req.body;

    const pillar = await updatePillar(id, {
      name,
      description,
      portfolioId,
    });

    res.status(200).json({
      success: true,
      data: pillar,
    });
  })
);

/**
 * @route   DELETE /api/pillars/:id
 * @desc    Delete pillar
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deletePillar(id);

    res.status(200).json({
      success: true,
      message: "Pillar deleted successfully",
    });
  })
);

/**
 * @route   GET /api/pillars/:id/stats
 * @desc    Get pillar statistics
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stats = await getPillarStats(id);

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

    // Get basic stats
    const stats = await getPortfolioStats(id);

    // Calculate health metrics
    const overallProgress = calculateOverallProgress(stats);
    const timelineHealth = await calculateTimelineHealth(id);

    // Get additional portfolio data for detailed analytics
    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: {
        pillars: {
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
        },
      },
    });

    if (!portfolio) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
    }

    const onTimeProjects = portfolio.pillars.reduce((count, pillar) => {
      return (
        count +
        pillar.projects.filter((project) => {
          const now = new Date();
          const endDate = new Date(project.endDate);
          return project.status === "COMPLETED" || now <= endDate;
        }).length
      );
    }, 0);

    const totalProjects = portfolio.pillars.reduce(
      (count, pillar) => count + pillar.projects.length,
      0
    );
    const onTimeProjectsPercentage =
      totalProjects > 0 ? (onTimeProjects / totalProjects) * 100 : 100;

    // Determine risk level
    

    // Count active issues
    let activeIssues = 0;
    const now = new Date();
    portfolio.pillars.forEach((pillar) => {
      pillar.projects.forEach((project) => {
        const isOverdue =
          now > new Date(project.endDate) && project.status !== "COMPLETED";
  
        if (isOverdue) {
          activeIssues++;
        }
      });
    });

    const analytics = {
      overallProgress,
      timelineHealth,
      activeProjects: stats.projects?.IN_PROGRESS || 0,
      completedProjects: stats.projects?.COMPLETED || 0,
      totalTeamMembers: new Set(
        portfolio.pillars.flatMap((pillar) =>
          pillar.projects.flatMap((project) =>
            project.members.map((member) => member.userId)
          )
        )
      ).size,
      onTimeProjects,
      onTimeProjectsPercentage:
        Math.round(onTimeProjectsPercentage * 100) / 100,
      // riskLevel is left undefined, you may implement it as needed
      activeIssues,
    };

    res.status(200).json({
      success: true,
      data: analytics,
    });
  })
);

/**
 * @route   GET /api/portfolios/:id/activity
 * @desc    Get portfolio activity feed
 * @access  Private
 */
router.get(
  "/:id/activity",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    // For now, return empty array since you don't have an activity/audit log system
    // You can implement this later by creating an Activity model in your database
    const activity: any[] = [];

    res.status(200).json({
      success: true,
      data: activity,
    });
  })
);

/**
 * @route   GET /api/portfolios/:id/pillars
 * @desc    Get pillars for a specific portfolio (nested route)
 * @access  Private
 */
router.get(
  "/:id/pillars",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id: portfolioId } = req.params;
    const pillars = await getAllPillars(portfolioId);

    res.status(200).json({
      success: true,
      data: pillars,
    });
  })
);
export default router;
