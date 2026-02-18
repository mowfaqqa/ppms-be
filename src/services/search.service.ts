
import { PrismaClient, Role } from "@prisma/client";
import { getNestedPortfolioScope, getNestedProjectScope, getTaskScope } from "../utils/check-access.util";

const prisma = new PrismaClient();

export const searchAll = async (
  query: string,
  user: {
    role: Role;
    userId: string;
  },
  options?: {
    limit?: number;
    category?: 'all' | 'projects' | 'tasks';
  }
) => {
  const { limit = 5, category = 'all' } = options || {};

  // Search projects
  let projects: any[] = [];
  if (category === 'all' || category === 'projects') {
    projects = await searchProjects(query, user, limit);
  }

  // Search tasks
  let tasks: any[] = [];
  if (category === 'all' || category === 'tasks') {
    tasks = await searchTasks(query, user, limit);
  }

  return {
    projects,
    tasks,
    total: projects.length + tasks.length,
    query,
  };
};

/**
 * Search projects
 */
const searchProjects = async (
  query: string,
  user: {
    role: Role;
    userId: string;
  },
  limit: number
) => {
  const nestedPortfolioScope = getNestedPortfolioScope(user);
  const projectScope = getNestedProjectScope(user);
  
  let where: any = {};

  if (user.role === "PROGRAM_MANAGER") {
    where = { ...where, ...nestedPortfolioScope };
  } else if (user.role === "PROJECT_MANAGER") {
    where = { ...where, ...projectScope };
  }

  where.AND = [
    ...(where.AND || []),
    {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
  ];

  const projects = await prisma.project.findMany({
    where,
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      portfolio: {
        select: {
          id: true,
          name: true,
          year: {
            select: {
              year: true,
            },
          },
        },
      },
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          tasks: true,
          members: true,
        },
      },
    },
    orderBy: [
      { createdAt: "desc" },
    ],
  });

  // Calculate progress for each project
  const projectsWithProgress = await Promise.all(
    projects.map(async (project) => {
      const taskStats = await prisma.task.groupBy({
        by: ['status'],
        where: {
          projectId: project.id,
        },
        _count: true,
      });

      const totalTasks = taskStats.reduce((sum, stat) => sum + stat._count, 0);
      const completedTasks = taskStats.find(stat => stat.status === 'COMPLETED')?._count || 0;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Calculate duration
      const start = new Date(project.startDate);
      const end = new Date(project.endDate);
      const durationMs = end.getTime() - start.getTime();
      const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

      return {
        ...project,
        progress,
        duration: durationDays,
        type: 'project' as const,
      };
    })
  );

  return projectsWithProgress;
};

/**
 * Search tasks 
 */
const searchTasks = async (
  query: string,
  user: {
    role: Role;
    userId: string;
  },
  limit: number
) => {
  const tasksScope = getTaskScope({ role: user.role, userId: user.userId });

  let where: any = { ...tasksScope };

  where.OR = [
    {
      title: {
        contains: query,
        mode: "insensitive",
      },
    },
    {
      description: {
        contains: query,
        mode: "insensitive",
      },
    },
  ];

  const tasks = await prisma.task.findMany({
    where,
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      project: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              name: true,
            },
          },
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
        },
      },
      assignments: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          subtasks: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });

  return tasks.map(task => ({
    ...task,
    type: 'task' as const,
  }));
};

export default {
  searchAll,
};