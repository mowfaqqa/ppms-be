import { PrismaClient, Project, ProjectStatus } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Create project
export const createProject = async (
  data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    status?: ProjectStatus;
    pillarId: string;
  },
  userId: string
): Promise<Project> => {
  // Check if pillar exists
  const pillar = await prisma.pillar.findUnique({
    where: { id: data.pillarId },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  // Check start date and end date
  if (new Date(data.startDate) > new Date(data.endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date cannot be after end date"
    );
  }

  // Create project with creator as project member with all permissions
  const project = await prisma.$transaction(async (tx) => {
    // Create project
    const newProject = await tx.project.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status || "PLANNING",
        pillarId: data.pillarId,
      },
    });

    // Get all permissions
    const permissions = await tx.permission.findMany({
      where: {
        name: {
          startsWith: "project.",
        },
      },
    });

    // Add creator as project member with all permissions
    await tx.projectMember.create({
      data: {
        userId,
        projectId: newProject.id,
        permissions: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });

    return newProject;
  });

  return project;
};

// Get all projects (with optional filters)
export const getAllProjects = async (filters?: {
  pillarId?: string;
  status?: ProjectStatus;
  search?: string;
}): Promise<any[]> => {
  const where: any = {};

  if (filters?.pillarId) {
    where.pillarId = filters.pillarId;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.search) {
    where.name = {
      contains: filters.search,
      mode: "insensitive",
    };
  }

  return prisma.project.findMany({
    where,
    include: {
      pillar: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      },
      _count: {
        select: {
          tasks: true,
          members: true,
        },
      },
    },
    orderBy: {
      startDate: "asc",
    },
  });
};

// Get project by ID
export const getProjectById = async (id: string): Promise<any> => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pillar: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          permissions: true,
        },
      },
      tasks: {
        where: {
          parentTaskId: null, // Only top-level tasks
        },
        include: {
          subtasks: {
            include: {
              assignments: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      budget: {
        include: {
          allocations: true,
          expenses: true,
        },
      },
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  return project;
};

// Update project
export const updateProject = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    status?: ProjectStatus;
    pillarId?: string;
  }
): Promise<Project> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // If updating pillar, check if pillar exists
  if (data.pillarId && data.pillarId !== project.pillarId) {
    const pillar = await prisma.pillar.findUnique({
      where: { id: data.pillarId },
    });

    if (!pillar) {
      throw new ApiError(HttpStatus.NOT_FOUND, "New pillar not found");
    }
  }

  // If updating dates, check they are valid
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  } else if (data.startDate && !data.endDate) {
    if (new Date(data.startDate) > new Date(project.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after current end date"
      );
    }
  } else if (!data.startDate && data.endDate) {
    if (new Date(project.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Current start date cannot be after end date"
      );
    }
  }

  return prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      status: data.status,
      pillarId: data.pillarId,
    },
  });
};

// Delete project
export const deleteProject = async (id: string): Promise<void> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  await prisma.project.delete({
    where: { id },
  });
};

// Add member to project
export const addProjectMember = async (
  projectId: string,
  userId: string,
  permissionIds: string[]
): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Check if user is already a member
  const existingMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (existingMember) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "User is already a member of this project"
    );
  }

  // Validate permissions
  if (permissionIds.length > 0) {
    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid permission IDs");
    }
  }

  return prisma.projectMember.create({
    data: {
      userId,
      projectId,
      permissions: {
        connect: permissionIds.map((id) => ({ id })),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      permissions: true,
    },
  });
};

// Update project member permissions
export const updateProjectMemberPermissions = async (
  projectId: string,
  userId: string,
  permissionIds: string[]
): Promise<any> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!projectMember) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  // Validate permissions
  if (permissionIds.length > 0) {
    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid permission IDs");
    }
  }

  return prisma.projectMember.update({
    where: {
      id: projectMember.id,
    },
    data: {
      permissions: {
        set: permissionIds.map((id) => ({ id })),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      permissions: true,
    },
  });
};

// Remove member from project
export const removeProjectMember = async (
  projectId: string,
  userId: string
): Promise<void> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!projectMember) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  await prisma.projectMember.delete({
    where: {
      id: projectMember.id,
    },
  });
};

// Get project stats
export const getProjectStats = async (id: string) => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get task counts by status
  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    select: {
      id: true,
      status: true,
      priority: true,
    },
  });

  const tasksByStatus = {
    TODO: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    COMPLETED: 0,
    total: tasks.length,
  };

  const tasksByPriority = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  tasks.forEach((task) => {
    tasksByStatus[task.status]++;
    tasksByPriority[task.priority]++;
  });

  // Get member count
  const memberCount = await prisma.projectMember.count({
    where: { projectId: id },
  });

  // Get budget summary if exists
  let budget = null;
  const projectBudget = await prisma.budget.findUnique({
    where: { projectId: id },
    include: {
      allocations: true,
      expenses: true,
    },
  });

  if (projectBudget) {
    const totalExpenses = projectBudget.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    budget = {
      totalAmount: projectBudget.totalAmount,
      totalExpenses,
      remainingAmount: projectBudget.totalAmount - totalExpenses,
      percentUsed: (totalExpenses / projectBudget.totalAmount) * 100,
    };
  }

  // Project timeline info
  const now = new Date();
  const startDate = new Date(project.startDate);
  const endDate = new Date(project.endDate);
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsedDuration = Math.min(
    now.getTime() - startDate.getTime(),
    totalDuration
  );
  const percentComplete = (elapsedDuration / totalDuration) * 100;

  const daysRemaining = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    tasks: {
      byStatus: tasksByStatus,
      byPriority: tasksByPriority,
    },
    memberCount,
    budget,
    timeline: {
      percentComplete,
      daysRemaining,
      isOverdue: now > endDate && project.status !== "COMPLETED",
    },
  };
};
