import { PrismaClient, Role } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

/**
 * Unified Activity Feed for Dashboard
 * Combines activities from multiple sources into a single chronological feed
 */

export interface UnifiedActivity {
  id: string;
  type: "AUDIT_LOG" | "PROGRAM_ACTIVITY" | "PROJECT_ACTIVITY" | "TASK_ACTIVITY";
  action: string;
  description: string;
  timestamp: Date;
  user: {
    id: string;
    name: string;
    email: string;
    staffId?: string;
    role: string;
  };
  entity: {
    type: string;
    id: string;
    name?: string;
  };
  metadata?: {
    portfolioId?: string;
    portfolioName?: string;
    programId?: string;
    programName?: string;
    projectId?: string;
    projectName?: string;
    taskId?: string;
    taskTitle?: string;
    changes?: any;
    ipAddress?: string;
  };
}

/**
 * Get unified activity feed for dashboard
 */
export const getDashboardActivities = async (
  filters: {
    userId?: string; // Filter by specific user
    entityType?: string; // Filter by entity type (PROJECT, TASK, PROGRAM, etc.)
    entityId?: string; // Filter by specific entity
    startDate?: Date;
    endDate?: Date;
    search?: string;
    page?: number;
    limit?: number;
  },
  requesterId: string,
  requesterRole: Role
) => {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 50, 100); // Max 100 items per page
  const skip = (page - 1) * limit;

  // Build date filter
  const dateFilter: any = {};
  if (filters.startDate || filters.endDate) {
    if (filters.startDate) {
      dateFilter.gte = filters.startDate;
    }
    if (filters.endDate) {
      dateFilter.lte = filters.endDate;
    }
  }

  // Get activities from all sources in parallel
  const [auditLogs, programActivities, projectActivities, taskActivities] =
    await Promise.all([
      // 1. Audit Logs
      getAuditLogActivities(filters, dateFilter, requesterRole, requesterId),

      // 2. Program Activities
      getProgramActivities(filters, dateFilter, requesterRole, requesterId),

      // 3. Project Activities
      getProjectActivities(filters, dateFilter, requesterRole, requesterId),

      // 4. Task Activities
      getTaskActivities(filters, dateFilter, requesterRole, requesterId),
    ]);

  // Combine all activities
  let allActivities: UnifiedActivity[] = [
    ...auditLogs,
    ...programActivities,
    ...projectActivities,
    ...taskActivities,
  ];

  // Apply search filter if provided
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    allActivities = allActivities.filter(
      (activity) =>
        activity.description.toLowerCase().includes(searchLower) ||
        activity.user.name.toLowerCase().includes(searchLower) ||
        activity.entity.name?.toLowerCase().includes(searchLower)
    );
  }

  // Sort by timestamp (most recent first)
  allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Get total count
  const total = allActivities.length;

  // Apply pagination
  const paginatedActivities = allActivities.slice(skip, skip + limit);

  return {
    activities: paginatedActivities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    summary: {
      totalActivities: total,
      auditLogCount: auditLogs.length,
      programActivityCount: programActivities.length,
      projectActivityCount: projectActivities.length,
      taskActivityCount: taskActivities.length,
    },
  };
};

/**
 * Get activities from audit logs
 */
async function getAuditLogActivities(
  filters: any,
  dateFilter: any,
  requesterRole: Role,
  requesterId: string
): Promise<UnifiedActivity[]> {
  const where: any = {};

  // Apply date filter
  if (Object.keys(dateFilter).length > 0) {
    where.timestamp = dateFilter;
  }

  // Apply user filter
  if (filters.userId) {
    where.userId = filters.userId;
  }

  // Apply entity type filter
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  // Apply entity ID filter
  if (filters.entityId) {
    where.entityId = filters.entityId;
  }

  // Program managers can only see logs for their portfolios/programs/projects
  if (requesterRole === "PROGRAM_MANAGER") {
    // Get portfolios where user can manage programs
    // For now, program managers see everything (you can add more specific logic)
  }

  // Project managers can only see logs for their projects
  if (requesterRole === "PROJECT_MANAGER") {
    const projectIds = await prisma.projectMember.findMany({
      where: { userId: requesterId },
      select: { projectId: true },
    });

    const taskIds = await prisma.task.findMany({
      where: { projectId: { in: projectIds.map((p) => p.projectId) } },
      select: { id: true },
    });

    where.OR = [
      {
        entityType: "PROJECT",
        entityId: { in: projectIds.map((p) => p.projectId) },
      },
      { entityType: "TASK", entityId: { in: taskIds.map((t) => t.id) } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          staffId: true,
          role: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
    take: 1000, // Limit to prevent excessive data
  });

  return logs.map((log) => ({
    id: log.id,
    type: "AUDIT_LOG" as const,
    action: log.action,
    description: log.description,
    timestamp: log.timestamp,
    user: {
      id: log.user.id,
      name: log.user.name,
      email: log.user.email,
      staffId: log.user.staffId,
      role: log.user.role,
    },
    entity: {
      type: log.entityType,
      id: log.entityId,
      name: log.entityName || undefined,
    },
    metadata: {
      changes: log.changes,
      ipAddress: log.ipAddress || undefined,
    },
  }));
}

/**
 * Get activities from program activity logs
 */
async function getProgramActivities(
  filters: any,
  dateFilter: any,
  requesterRole: Role,
  requesterId: string
): Promise<UnifiedActivity[]> {
  const where: any = {};

  // Apply date filter
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter;
  }

  // Apply user filter
  if (filters.userId) {
    where.userId = filters.userId;
  }

  // Filter by specific program if entityType is PROGRAM
  if (filters.entityType === "PROGRAM" && filters.entityId) {
    where.programId = filters.entityId;
  }

  // Program managers can see program activities (add specific logic if needed)
  // Project managers cannot see program activities unless they're also program managers

  const activities = await prisma.programActivity.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          staffId: true,
          role: true,
        },
      },
      program: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return activities.map((activity: any) => ({
    id: activity.id,
    type: "PROGRAM_ACTIVITY" as const,
    action: activity.type,
    description: activity.description,
    timestamp: activity.createdAt,
    user: {
      id: activity.user.id,
      name: activity.user.name,
      email: activity.user.email,
      staffId: activity.user.staffId,
      role: activity.user.role,
    },
    entity: {
      type: "PROGRAM",
      id: activity.program.id,
      name: activity.program.name,
    },
    metadata: {
      programId: activity.program.id,
      programName: activity.program.name,
      portfolioId: activity.program.portfolio.id,
      portfolioName: activity.program.portfolio.name,
      ...activity.metadata,
    },
  }));
}
/**
 * Get activities from project activity logs
 */
async function getProjectActivities(
  filters: any,
  dateFilter: any,
  requesterRole: Role,
  requesterId: string
): Promise<UnifiedActivity[]> {
  const where: any = {};

  // Apply date filter
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter;
  }

  // Apply user filter
  if (filters.userId) {
    where.userId = filters.userId;
  }

  // Filter by specific project if entityType is PROJECT
  if (filters.entityType === "PROJECT" && filters.entityId) {
    where.projectId = filters.entityId;
  }

  // Project managers can only see activities for their projects
  if (requesterRole === "PROJECT_MANAGER") {
    const projectIds = await prisma.projectMember.findMany({
      where: { userId: requesterId },
      select: { projectId: true },
    });

    where.projectId = { in: projectIds.map((p) => p.projectId) };
  }

  const activities = await prisma.projectActivity.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          staffId: true,
          role: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          program: {
            select: {
              id: true,
              name: true,
            },
          },
          portfolio: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return activities.map((activity: any) => ({
    id: activity.id,
    type: "PROJECT_ACTIVITY" as const,
    action: activity.type,
    description: activity.description,
    timestamp: activity.createdAt,
    user: {
      id: activity.user.id,
      name: activity.user.name,
      email: activity.user.email,
      staffId: activity.user.staffId,
      role: activity.user.role,
    },
    entity: {
      type: "PROJECT",
      id: activity.project.id,
      name: activity.project.name,
    },
    metadata: {
      projectId: activity.project.id,
      projectName: activity.project.name,
      programId: activity.project.program?.id,
      programName: activity.project.program?.name,
      portfolioId: activity.project.portfolio.id,
      portfolioName: activity.project.portfolio.name,
      ...activity.metadata,
    },
  }));
}

/**
 * Get activities from task activity logs
 */
async function getTaskActivities(
  filters: any,
  dateFilter: any,
  requesterRole: Role,
  requesterId: string
): Promise<UnifiedActivity[]> {
  const where: any = {};

  // Apply date filter
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter;
  }

  // Apply user filter
  if (filters.userId) {
    where.userId = filters.userId;
  }

  // Filter by specific task if entityType is TASK
  if (filters.entityType === "TASK" && filters.entityId) {
    where.taskId = filters.entityId;
  }

  // Project managers can only see activities for tasks in their projects
  if (requesterRole === "PROJECT_MANAGER") {
    const projectIds = await prisma.projectMember.findMany({
      where: { userId: requesterId },
      select: { projectId: true },
    });

    const taskIds = await prisma.task.findMany({
      where: { projectId: { in: projectIds.map((p) => p.projectId) } },
      select: { id: true },
    });

    where.taskId = { in: taskIds.map((t) => t.id) };
  }

  const activities = await prisma.taskActivity.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          staffId: true,
          role: true,
        },
      },
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
              program: {
                select: {
                  id: true,
                  name: true,
                },
              },
              portfolio: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return activities.map((activity: any) => ({
    id: activity.id,
    type: "TASK_ACTIVITY" as const,
    action: activity.type,
    description: activity.description,
    timestamp: activity.createdAt,
    user: {
      id: activity.user.id,
      name: activity.user.name,
      email: activity.user.email,
      staffId: activity.user.staffId,
      role: activity.user.role,
    },
    entity: {
      type: "TASK",
      id: activity.task.id,
      name: activity.task.title,
    },
    metadata: {
      taskId: activity.task.id,
      taskTitle: activity.task.title,
      projectId: activity.task.project.id,
      projectName: activity.task.project.name,
      programId: activity.task.project.program?.id,
      programName: activity.task.project.program?.name,
      portfolioId: activity.task.project.portfolio.id,
      portfolioName: activity.task.project.portfolio.name,
      ...activity.metadata,
    },
  }));
}

/**
 * Get activity statistics for dashboard
 */
export const getActivityStats = async (
  timeframe: "today" | "week" | "month" | "year",
  requesterId: string,
  requesterRole: Role
) => {
  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "month":
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case "year":
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
  }

  const dateFilter = { gte: startDate };

  // Get counts from all sources
  const where: any = {};

  // Project managers can only see their projects
  if (requesterRole === "PROJECT_MANAGER") {
    const projectIds = await prisma.projectMember.findMany({
      where: { userId: requesterId },
      select: { projectId: true },
    });

    const taskIds = await prisma.task.findMany({
      where: { projectId: { in: projectIds.map((p) => p.projectId) } },
      select: { id: true },
    });

    where.OR = [
      {
        entityType: "PROJECT",
        entityId: { in: projectIds.map((p) => p.projectId) },
      },
      { entityType: "TASK", entityId: { in: taskIds.map((t) => t.id) } },
    ];
  }

  const [
    auditLogCount,
    programActivityCount,
    projectActivityCount,
    taskActivityCount,
    auditByAction,
    mostActiveUsers,
  ] = await Promise.all([
    prisma.auditLog.count({
      where: { ...where, timestamp: dateFilter },
    }),

    prisma.programActivity.count({
      where: {
        createdAt: dateFilter,
      },
    }),

    prisma.projectActivity.count({
      where: {
        createdAt: dateFilter,
        ...(requesterRole === "PROJECT_MANAGER" && {
          projectId: {
            in: (
              await prisma.projectMember.findMany({
                where: { userId: requesterId },
                select: { projectId: true },
              })
            ).map((p) => p.projectId),
          },
        }),
      },
    }),

    prisma.taskActivity.count({
      where: {
        createdAt: dateFilter,
        ...(requesterRole === "PROJECT_MANAGER" && {
          taskId: {
            in: (
              await prisma.task.findMany({
                where: {
                  projectId: {
                    in: (
                      await prisma.projectMember.findMany({
                        where: { userId: requesterId },
                        select: { projectId: true },
                      })
                    ).map((p) => p.projectId),
                  },
                },
                select: { id: true },
              })
            ).map((t) => t.id),
          },
        }),
      },
    }),

    prisma.auditLog.groupBy({
      by: ["action"],
      where: { ...where, timestamp: dateFilter },
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 10,
    }),

    prisma.auditLog.groupBy({
      by: ["userId"],
      where: { ...where, timestamp: dateFilter },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    }),
  ]);

  // Get user details for most active users
  const userIds = mostActiveUsers.map((u) => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      email: true,
      staffId: true,
      role: true,
    },
  });

  const mostActiveUsersWithDetails = mostActiveUsers.map((u) => ({
    user: users.find((user) => user.id === u.userId),
    activityCount: u._count.userId,
  }));

  return {
    timeframe,
    startDate,
    totalActivities:
      auditLogCount +
      programActivityCount +
      projectActivityCount +
      taskActivityCount,
    breakdown: {
      auditLogs: auditLogCount,
      programActivities: programActivityCount,
      projectActivities: projectActivityCount,
      taskActivities: taskActivityCount,
    },
    topActions: auditByAction.map((action) => ({
      action: action.action,
      count: action._count.action,
    })),
    mostActiveUsers: mostActiveUsersWithDetails,
  };
};

/**
 * Get recent activity summary (last 24 hours)
 */
export const getRecentActivitySummary = async (
  requesterId: string,
  requesterRole: Role
) => {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await getDashboardActivities(
    {
      startDate: last24Hours,
      limit: 10, // Just get latest 10
    },
    requesterId,
    requesterRole
  );

  return {
    recentActivities: result.activities,
    summary: result.summary,
  };
};
