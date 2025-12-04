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
    const timelineHealth = await calculateTimelineHealth(portfolioId);

    // Get additional metrics
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
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

    // Calculate team members
    let totalTeamMembers = new Set();

    portfolio.pillars.forEach((pillar) => {
      pillar.projects.forEach((project) => {
        // Count unique team members
        project.members.forEach((member) => {
          totalTeamMembers.add(member.user.id);
        });
      });
    });

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
    if (timelineHealth < 50 || overallProgress < 30) {
      riskLevel = "HIGH";
    } else if (
      timelineHealth < 70 ||
      overallProgress < 50
    ) {
      riskLevel = "MEDIUM";
    }

    // Count active issues (projects that are overdue)
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

    return {
      overallProgress,
      timelineHealth,
      activeProjects: stats.projects?.IN_PROGRESS || 0,
      completedProjects: stats.projects?.COMPLETED || 0,
      totalTeamMembers: totalTeamMembers.size,
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
  calculateTimelineHealth,
  getPortfolioAnalytics,
};
