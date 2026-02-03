// routes/dashboard-activity.routes.ts
import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  getDashboardActivities,
  getActivityStats,
  getRecentActivitySummary,
  getScheduleOverview
} from "../services/dashboard-activity.service";
import { getPortfolioScope, getNestedPortfolioScope } from "../utils/check-access.util";

const router = Router();

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics (project counts, task counts, etc.)
 * @access  Private - Admin, Project Managers and Program Managers
 */
router.get(
  "/dashboard/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const userRoles = req.user.role;
    const userId = req.user.userId;
    const now = new Date();
    let dashboardDTO = {};

    const portfolioScope = getPortfolioScope(req.user);
    const nestedPortfolioScope = getNestedPortfolioScope(req.user);

    try {
      // Admin DTO
      if(userRoles === "ADMIN" || userRoles === "PROGRAM_MANAGER") {
        // Get all portfolios count, active and ended
        const [activePortfolios, endedPortfolios, totalPortfolios] = await Promise.all([
          prisma.portfolio.count({
            where: {
              ...portfolioScope,
              startDate: { lte: now },
              endDate: { gte: now },
            },
          }),
          prisma.portfolio.count({
            where: {
              ...portfolioScope,
              endDate: { lt: now },
            },
          }),
          prisma.portfolio.count({
            where: portfolioScope
          }),
        ]);      
  
        // Get project counts
        const totalProjects = await prisma.project.count({
          where: {
            ...nestedPortfolioScope,
            programId: {
              not: null
            }
          }
        });
        const activeProjects = await prisma.project.count({
          where: {
            ...nestedPortfolioScope,
            status: { in: ["PLANNING", "IN_PROGRESS"] },
          },
        });
        const completedProjects = await prisma.project.count({
          where: { 
            ...nestedPortfolioScope,
            status: "COMPLETED" 
          },
        });
  
        // Get program count
        const totalPrograms = await prisma.program.count({
          where: nestedPortfolioScope
        });
  
        //Get standalone projects
        const totalStandaloneProjects = await prisma.project.count({
          where: {
            ...nestedPortfolioScope,
            programId: null
          }
        });
        
        dashboardDTO = {
          totalProjects,
          totalPrograms,
          activeProjects,
          completedProjects,
          activePortfolios, 
          endedPortfolios, 
          totalPortfolios,
          totalStandaloneProjects,
        }
      } else if (userRoles === "PROJECT_MANAGER") {
        const managedProjects = await prisma.projectMember.findMany({
          where: {
            userId,
            role: "PROJECT_MANAGER",
          },
          select: {
            projectId: true,
          },
        });
      
        const projectIds = managedProjects.map(p => p.projectId);
      
        const [
          totalTasks,
          totalFiles,
          totalTeamMembers,
          projectsByStatus,
          tasksByStatus
        ] = await Promise.all([
          prisma.task.count({ where: { projectId: { in: projectIds } } }),
          prisma.projectFile.count({ where: { projectId: { in: projectIds } } }),
          prisma.projectMember.count({
            where: {
              projectId: { in: projectIds },
              role: "TEAM_MEMBER",
            },
          }),
          // Add project status distribution
          prisma.project.groupBy({
            by: ["status"],
            where: { id: { in: projectIds } },
            _count: { status: true },
          }),
          // Add task status distribution
          prisma.task.groupBy({
            by: ["status"],
            where: { projectId: { in: projectIds } },
            _count: { status: true },
          }),
        ]);
      
        const projectStatusMap = {
          PLANNING: 0,
          IN_PROGRESS: 0,
          ON_HOLD: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        };
      
        projectsByStatus.forEach((item: any) => {
          projectStatusMap[item.status as keyof typeof projectStatusMap] = item._count.status;
        });
      
        const taskStatusMap = {
          TODO: 0,
          IN_PROGRESS: 0,
          REVIEW: 0,
          COMPLETED: 0,
        };
      
        tasksByStatus.forEach((item: any) => {
          taskStatusMap[item.status as keyof typeof taskStatusMap] = item._count.status;
        });
      
        dashboardDTO = {
          totalProjects: projectIds.length,
          activeProjects: projectIds.length, 
          totalTasks,
          totalFiles,
          totalTeamMembers,
          projectsByStatus: projectStatusMap,
          tasksByStatus: taskStatusMap,
        }
      }

      res.status(200).json({
        success: true,
        data: {
         ...dashboardDTO
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * @route   GET /api/dashboard/activities
 * @desc    Get unified activity feed for dashboard (all system activities)
 * @access  Private - Admin sees all, Project Manager sees their projects only
 */
router.get(
  "/dashboard/activities",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER", "PROGRAM_MANAGER"]),
  [
    check("userId", "Invalid user ID format").optional(),
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
    check("entityId", "Invalid entity ID format").optional(),
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
 */
router.get(
  "/dashboard/activities/stats",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER", "PROGRAM_MANAGER"]),
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
 */
router.get(
  "/dashboard/activities/recent",
  authenticate,
  authorize(["ADMIN", "PROJECT_MANAGER","PROGRAM_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const summary = await getRecentActivitySummary(
      req.user!.userId,
      req.user!.role
    );

    // FIX: Return activities directly (not nested in summary)
    res.status(200).json({
      success: true,
      data: {
        recentActivities: summary.recentActivities, // This matches frontend expectation
        timeframe: "Last 24 hours",
        count: summary.recentActivities.length,
      },
    });
  })
);

/**
 * @route   GET /api/dashboard/activities/export
 * @desc    Export activity feed to CSV
 * @access  Private - Admin only
 */
router.get(
  "/dashboard/activities/export",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("userId", "Invalid user ID format").optional(),
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
      ]),
    check("entityId", "Invalid entity ID format").optional(),
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
 */
router.get(
  "/dashboard/activities/user/:userId",
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
 */
router.get(
  "/dashboard/activities/project/:projectId",
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

      await prisma.$disconnect();

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

/**
 * @route   GET /api/projects/stats
 * @desc    Get project statistics by status (role-filtered)
 * @access  Private - Admin, Program Manager, Project Manager
 */
router.get(
  "/dashboard/projects/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
     const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const userRole = req.user.role;
    const userId = req.user.userId;

    try {
      let whereClause: any = {};

      // Apply role-based filtering
      if (userRole === "PROGRAM_MANAGER") {
        const nestedPortfolioScope = getNestedPortfolioScope(req.user);
        whereClause = nestedPortfolioScope;
      } else if (userRole === "PROJECT_MANAGER") {
        const projectIds = await prisma.projectMember.findMany({
          where: { 
            userId,
            role: "PROJECT_MANAGER"
          },
          select: { projectId: true },
        });
        whereClause = { id: { in: projectIds.map((p: any) => p.projectId) } };
      }

      // Get all projects with details
      const projects = await prisma.project.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          _count: {
            select: {
              tasks: true,
            },
          },
          portfolio: {
            select: {
              id: true,
              name: true,
            },
          },
          program: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Group projects by status
      const projectsByStatus: any = {
        PLANNING: [],
        IN_PROGRESS: [],
        ON_HOLD: [],
        COMPLETED: [],
        CANCELLED: [],
      };

      projects.forEach((project) => {
        projectsByStatus[project.status].push({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          taskCount: project._count.tasks,
          portfolio: project.portfolio,
          program: project.program,
        });
      });

      // Get status distribution counts
      const statusDistribution = {
        PLANNING: projectsByStatus.PLANNING.length,
        IN_PROGRESS: projectsByStatus.IN_PROGRESS.length,
        ON_HOLD: projectsByStatus.ON_HOLD.length,
        COMPLETED: projectsByStatus.COMPLETED.length,
        CANCELLED: projectsByStatus.CANCELLED.length,
      };

      res.status(200).json({
        success: true,
        data: {
          kind: "project",
          statusDistribution,
          projectsByStatus,
          total: projects.length,
          summary: {
            totalProjects: projects.length,
            totalTasks: projects.reduce((sum, p) => sum + p._count.tasks, 0),
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * @route   GET /api/tasks/stats
 * @desc    Get task statistics by status (role-filtered)
 * @access  Private - Admin, Program Manager, Project Manager
 */
router.get(
  "/dashboard/tasks/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
   const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const userRole = req.user.role;
    const userId = req.user.userId;

    try {
      let whereClause: any = {};

      // Apply role-based filtering
      if (userRole === "PROGRAM_MANAGER") {
        const nestedPortfolioScope = getNestedPortfolioScope(req.user);
        whereClause = { project: nestedPortfolioScope };
      } else if (userRole === "PROJECT_MANAGER") {
        const projectIds = await prisma.projectMember.findMany({
          where: { 
            userId,
            role: "PROJECT_MANAGER"
          },
          select: { projectId: true },
        });
        whereClause = { projectId: { in: projectIds.map((p: any) => p.projectId) } };
      }

      // Get all tasks with details
      const tasks = await prisma.task.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          startDate: true,
          endDate: true,
          project: {
            select: {
              id: true,
              name: true,
              portfolio: {
                select: {
                  id: true,
                  name: true,
                },
              },
              program: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignments: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            // REMOVED: take: 3 - not supported in nested select
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Group tasks by status
      const tasksByStatus: any = {
        TODO: [],
        IN_PROGRESS: [],
        REVIEW: [],
        COMPLETED: [],
      };

      tasks.forEach((task: any) => {
        tasksByStatus[task.status].push({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          startDate: task.startDate,
          endDate: task.endDate,
          project: task.project,
          // CHANGED: Limit to 3 assignees in JavaScript instead
          assignees: task.assignments.slice(0, 3).map((a: any) => a.user),
        });
      });

      // Get status distribution counts
      const statusDistribution = {
        TODO: tasksByStatus.TODO.length,
        IN_PROGRESS: tasksByStatus.IN_PROGRESS.length,
        REVIEW: tasksByStatus.REVIEW.length,
        COMPLETED: tasksByStatus.COMPLETED.length,
      };

      // Calculate completion metrics
      const totalTasks = tasks.length;
      const completedTasks = tasksByStatus.COMPLETED.length;
      const completionRate = totalTasks > 0 
        ? ((completedTasks / totalTasks) * 100).toFixed(1) 
        : "0";

      res.status(200).json({
        success: true,
        data: {
          statusDistribution,
          tasksByStatus,
          total: totalTasks,
          summary: {
            totalTasks,
            completedTasks,
            completionRate: parseFloat(completionRate),
            inProgressTasks: tasksByStatus.IN_PROGRESS.length,
            todoTasks: tasksByStatus.TODO.length,
            reviewTasks: tasksByStatus.REVIEW.length,
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * @route   GET /api/dashboard/portfolios/stats
 * @desc    Get portfolio statistics by status (Admin and Program Manager only)
 * @access  Private - Admin, Program Manager
 */
router.get(
  "/dashboard/portfolios/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const userRole = req.user.role;
    const now = new Date();

    try {
      const portfolioScope = getPortfolioScope(req.user);

      // Get all portfolios with details
      const portfolios = await prisma.portfolio.findMany({
        where: portfolioScope,
        select: {
          id: true,
          name: true,
          description: true,
          startDate: true,
          endDate: true,
          status: true,
          yearId: true,
          _count: {
            select: {
              programs: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Group portfolios by status (Active vs Completed)
      const portfoliosByStatus: any = {
        ACTIVE: [],
        COMPLETED: [],
      };

      portfolios.forEach((portfolio) => {
        const endDate = new Date(portfolio.endDate);
        const isActive = now <= endDate;
        
        const statusKey = isActive ? 'ACTIVE' : 'COMPLETED';
        portfoliosByStatus[statusKey].push({
          id: portfolio.id,
          name: portfolio.name,
          description: portfolio.description,
          startDate: portfolio.startDate,
          endDate: portfolio.endDate,
          status: portfolio.status,
          programCount: portfolio._count.programs,
        });
      });

      // Get status distribution counts
      const statusDistribution = {
        ACTIVE: portfoliosByStatus.ACTIVE.length,
        COMPLETED: portfoliosByStatus.COMPLETED.length,
      };

      res.status(200).json({
        success: true,
        data: {
          kind: "portfolio",
          statusDistribution,
          portfoliosByStatus,
          total: portfolios.length,
          summary: {
            totalPortfolios: portfolios.length,
            totalPrograms: portfolios.reduce((sum, p) => sum + p._count.programs, 0),
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * @route   GET /api/dashboard/programs/stats
 * @desc    Get program statistics by status (Admin and Program Manager only)
 * @access  Private - Admin, Program Manager
 */
router.get(
  "/dashboard/program/stats",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const userRole = req.user.role;

    try {
      const nestedPortfolioScope = getNestedPortfolioScope(req.user);

      // Get all programs with details
      const programs = await prisma.program.findMany({
        where: nestedPortfolioScope,
        select: {
          id: true,
          name: true,
          description: true,
          startDate: true,
          endDate: true,
          status: true,
          portfolioId: true,
          portfolio: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              projects: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Group programs by status (Active: Planning + In Progress vs Completed)
      const programsByStatus: any = {
        ACTIVE: [],
        COMPLETED: [],
      };

      programs.forEach((program) => {
        const isActive = program.status === 'PLANNING' || program.status === 'IN_PROGRESS';
        const statusKey = isActive ? 'ACTIVE' : 'COMPLETED';
        
        programsByStatus[statusKey].push({
          id: program.id,
          name: program.name,
          description: program.description,
          startDate: program.startDate,
          endDate: program.endDate,
          status: program.status,
          projectCount: program._count.projects,
          portfolio: program.portfolio,
        });
      });

      // Get status distribution counts
      const statusDistribution = {
        ACTIVE: programsByStatus.ACTIVE.length,
        COMPLETED: programsByStatus.COMPLETED.length,
      };

      res.status(200).json({
        success: true,
        data: {
          kind: "program",
          statusDistribution,
          programsByStatus,
          total: programs.length,
          summary: {
            totalPrograms: programs.length,
            totalProjects: programs.reduce((sum, p) => sum + p._count.projects, 0),
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * @route   GET /api/dashboard/schedule-overview
 * @desc    Get schedule overview (on schedule, behind schedule, etc.)
 * @access  Private - Admin and Program Manager only
 */
router.get(
  "/dashboard/schedule-overview",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER"]),
  asyncHandler(async (req: any, res: any) => {
    const overview = await getScheduleOverview(
      req.user!.userId,
      req.user!.role
    );

    res.status(200).json({
      success: true,
      data: overview,
    });
  })
);

export default router;