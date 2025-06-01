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
  calculateBudgetHealth,
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
    const budgetHealth = await calculateBudgetHealth(id);
    const timelineHealth = await calculateTimelineHealth(id);

    // Get additional portfolio data for detailed analytics
    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: {
        pillars: {
          include: {
            projects: {
              include: {
                budget: {
                  include: {
                    expenses: true,
                    allocations: true,
                  },
                },
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

    // Calculate budget metrics
    let totalBudgetAllocated = 0;
    let totalBudgetUtilized = 0;
    let totalTeamMembers = new Set();
    const budgetBreakdown: any[] = [];

    portfolio.pillars.forEach((pillar) => {
      let pillarAllocated = 0;
      let pillarUtilized = 0;

      pillar.projects.forEach((project) => {
        project.members.forEach((member) => {
          totalTeamMembers.add(member.user.id);
        });

        if (project.budget) {
          const allocated = project.budget.totalAmount;
          const utilized = project.budget.expenses.reduce(
            (sum, expense) => sum + expense.amount,
            0
          );

          totalBudgetAllocated += allocated;
          totalBudgetUtilized += utilized;
          pillarAllocated += allocated;
          pillarUtilized += utilized;
        }
      });

      if (pillarAllocated > 0) {
        budgetBreakdown.push({
          pillarName: pillar.name,
          allocated: pillarAllocated,
          utilized: pillarUtilized,
          utilizationRate: (pillarUtilized / pillarAllocated) * 100,
        });
      }
    });

    // Calculate additional metrics
    const budgetVariance =
      totalBudgetAllocated > 0
        ? ((totalBudgetUtilized - totalBudgetAllocated) /
            totalBudgetAllocated) *
          100
        : 0;

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
    let riskLevel = "LOW";
    if (budgetHealth < 50 || timelineHealth < 50 || overallProgress < 30) {
      riskLevel = "HIGH";
    } else if (
      budgetHealth < 70 ||
      timelineHealth < 70 ||
      overallProgress < 50
    ) {
      riskLevel = "MEDIUM";
    }

    // Count active issues
    let activeIssues = 0;
    const now = new Date();
    portfolio.pillars.forEach((pillar) => {
      pillar.projects.forEach((project) => {
        const isOverdue =
          now > new Date(project.endDate) && project.status !== "COMPLETED";
        const isOverBudget =
          project.budget &&
          project.budget.expenses.reduce(
            (sum, expense) => sum + expense.amount,
            0
          ) > project.budget.totalAmount;

        if (isOverdue || isOverBudget) {
          activeIssues++;
        }
      });
    });

    const analytics = {
      overallProgress,
      budgetHealth,
      timelineHealth,
      budgetUtilized: totalBudgetUtilized,
      budgetAllocated: totalBudgetAllocated,
      activeProjects: stats.projects?.IN_PROGRESS || 0,
      completedProjects: stats.projects?.COMPLETED || 0,
      totalTeamMembers: totalTeamMembers.size,
      budgetBreakdown,
      budgetVariance: Math.round(budgetVariance * 100) / 100,
      onTimeProjects,
      onTimeProjectsPercentage:
        Math.round(onTimeProjectsPercentage * 100) / 100,
      riskLevel,
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
