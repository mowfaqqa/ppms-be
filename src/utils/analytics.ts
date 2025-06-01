import { PrismaClient } from "@prisma/client";
import { getPortfolioStats } from "../services/portfolio.service";
import { ApiError, HttpStatus } from "./error.utils";

const prisma = new PrismaClient();

const calculateOverallProgress = (stats: any): number => {
  if (!stats.projects || stats.projects.total === 0) {
    return 0;
  }

  const {
    PLANNING = 0,
    IN_PROGRESS = 0,
    ON_HOLD = 0,
    COMPLETED = 0,
    CANCELLED = 0,
    total = 0,
  } = stats.projects;

  // Weight different statuses differently
  const weightedProgress =
    PLANNING * 0.1 + // Planning is 10% complete
    IN_PROGRESS * 0.5 + // In Progress is 50% complete
    ON_HOLD * 0.3 + // On Hold is 30% complete
    COMPLETED * 1.0 + // Completed is 100% complete
    CANCELLED * 0.0; // Cancelled is 0% complete

  return Math.round((weightedProgress / total) * 100);
};

/**
 * Calculate budget health based on spending vs allocation
 */
const calculateBudgetHealth = async (portfolioId: string): Promise<number> => {
  try {
    // Get portfolio budget information
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        pillars: {
          include: {
            projects: {
              include: {
                budget: {
                  include: {
                    expenses: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!portfolio) return 100;

    // Calculate total allocated budget across all projects
    let totalAllocated = 0;
    let totalSpent = 0;

    portfolio.pillars.forEach((pillar) => {
      pillar.projects.forEach((project) => {
        if (project.budget) {
          totalAllocated += project.budget.totalAmount;
          totalSpent += project.budget.expenses.reduce(
            (sum, expense) => sum + expense.amount,
            0
          );
        }
      });
    });

    if (totalAllocated === 0) return 100;

    const spendingRatio = totalSpent / totalAllocated;

    // Budget health scoring:
    // 0-70% spent = 100% health (good)
    // 70-90% spent = declining health
    // 90-100% spent = 50% health (warning)
    // >100% spent = 0% health (critical)

    if (spendingRatio <= 0.7) return 100;
    if (spendingRatio <= 0.9)
      return Math.round(100 - (spendingRatio - 0.7) * 250); // Linear decline
    if (spendingRatio <= 1.0)
      return Math.round(50 - (spendingRatio - 0.9) * 500); // Steeper decline
    return 0; // Over budget
  } catch (error) {
    console.error("Error calculating budget health:", error);
    return 100; // Default to healthy if calculation fails
  }
};

/**
 * Calculate timeline health based on project schedules
 */
const calculateTimelineHealth = async (
  portfolioId: string
): Promise<number> => {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        pillars: {
          include: {
            projects: true,
          },
        },
      },
    });

    if (!portfolio) return 100;

    const now = new Date();
    let totalProjects = 0;
    let healthyProjects = 0;
    let warningProjects = 0;
    let criticalProjects = 0;

    portfolio.pillars.forEach((pillar) => {
      pillar.projects.forEach((project) => {
        totalProjects++;

        const endDate = new Date(project.endDate);
        const startDate = new Date(project.startDate);
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        const progressRatio = elapsed / totalDuration;

        // Determine project health based on status and timeline
        if (project.status === "COMPLETED") {
          healthyProjects++;
        } else if (project.status === "CANCELLED") {
          // Don't count cancelled projects in health calculation
          totalProjects--;
        } else if (now > endDate) {
          // Overdue projects are critical
          criticalProjects++;
        } else if (progressRatio > 0.8) {
          // Projects in final 20% of timeline need attention
          if (project.status === "PLANNING" || project.status === "ON_HOLD") {
            criticalProjects++;
          } else {
            warningProjects++;
          }
        } else {
          healthyProjects++;
        }
      });
    });

    if (totalProjects === 0) return 100;

    // Calculate weighted timeline health
    const healthScore =
      (healthyProjects * 100 + warningProjects * 60 + criticalProjects * 0) /
      totalProjects;

    return Math.round(healthScore);
  } catch (error) {
    console.error("Error calculating timeline health:", error);
    return 100; // Default to healthy if calculation fails
  }
};

/**
 * Get comprehensive portfolio analytics
 */
const getPortfolioAnalytics = async (portfolioId: string) => {
  try {
    // Get basic stats
    const stats = await getPortfolioStats(portfolioId);

    // Calculate health metrics
    const overallProgress = calculateOverallProgress(stats);
    const budgetHealth = await calculateBudgetHealth(portfolioId);
    const timelineHealth = await calculateTimelineHealth(portfolioId);

    // Get additional metrics
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
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
        // Count unique team members
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

    // Count active issues (projects that are overdue or over budget)
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

    return {
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
  } catch (error) {
    console.error("Error getting portfolio analytics:", error);
    throw error;
  }
};

// Export the functions if you're putting them in a separate file
export {
  calculateOverallProgress,
  calculateBudgetHealth,
  calculateTimelineHealth,
  getPortfolioAnalytics,
};
