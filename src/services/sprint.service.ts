import { PrismaClient, Role, Sprint, SprintStatus, Task } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { getTaskScope } from "../utils/check-access.util";

const prisma = new PrismaClient();

export interface CreateSprintData {
  name: string;
  goal?: string;
  startDate: Date;
  endDate: Date;
  status?: SprintStatus;
}

export interface UpdateSprintData {
  name?: string;
  goal?: string;
  startDate?: Date;
  endDate?: Date;
  status?: SprintStatus;
}

export interface SprintStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  totalTimeLogged: number; // in minutes
  completionPercentage: number;
  daysRemaining: number;
  isOverdue: boolean;
}

// Create sprint
export const createSprint = async (
  projectId: string,
  data: CreateSprintData,
  userId: string
): Promise<Sprint> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Validate dates
  if (new Date(data.startDate) >= new Date(data.endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Check for overlapping active sprints
  if (data.status === "ACTIVE" || !data.status) {
    const activeSprint = await prisma.sprint.findFirst({
      where: {
        projectId,
        status: "ACTIVE",
      },
    });

    if (activeSprint) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "Project already has an active sprint. Complete or cancel the current sprint first."
      );
    }
  }

  // Create sprint in transaction
  const sprint = await prisma.$transaction(async (tx) => {
    const newSprint = await tx.sprint.create({
      data: {
        name: data.name,
        goal: data.goal,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status || "PLANNED",
        projectId,
      },
    });

    // Create project activity log
    await tx.projectActivity.create({
      data: {
        type: "SPRINT_CREATED",
        description: `created sprint "${newSprint.name}"`,
        projectId,
        userId,
        metadata: {
          sprintId: newSprint.id,
          sprintName: newSprint.name,
          sprintGoal: newSprint.goal,
          startDate: newSprint.startDate.toISOString(),
          endDate: newSprint.endDate.toISOString(),
        },
      },
    });

    return newSprint;
  });

  return sprint;
};

// Get all sprints for a project
export const getProjectSprints = async (
  projectId: string,
  status?: SprintStatus,
  user?: { role: Role, userId: string }
): Promise<any[]> => {
  // Check if project exists
  const sprintScope = getTaskScope(user);

  // First: verify project exists AND user has access
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(user.role === "PROGRAM_MANAGER"
        ? {
            portfolio: {
              programManagers: {
                some: { id: user.userId },
              },
            },
          }
        : user.role === "PROJECT_MANAGER"
        ? {
            members: {
              some: {
                userId: user.userId,
                role: "PROJECT_MANAGER",
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found or access denied");
  }

  // Now fetch sprints safely
  const where: any = {
    projectId: project.id,
    ...sprintScope,
  };

  if (status) {
    where.status = status;
  }

  return prisma.sprint.findMany({
    where,
    include: {
      _count: {
        select: {
          tasks: true,
          backlogItems: true,
        },
      },
    },
    orderBy: [
      { status: "asc" }, // Active sprints first
      { startDate: "desc" }, // Most recent first
    ],
  });
};

// Get sprint by ID with detailed information
export const getSprintById = async (sprintId: string): Promise<any> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
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
        },
      },
      tasks: {
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
          _count: {
            select: {
              subtasks: true,
              timeEntries: true,
            },
          },
        },
        orderBy: [
          { priority: "desc" },
          { status: "asc" },
          { createdAt: "desc" },
        ],
      },
      backlogItems: {
        include: {
          tasks: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          priority: "asc",
        },
      },
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  return sprint;
};

// Update sprint
export const updateSprint = async (
  sprintId: string,
  data: UpdateSprintData,
  userId: string
): Promise<Sprint> => {
  // Check if sprint exists
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  // Validate dates if provided
  const startDate = data.startDate || sprint.startDate;
  const endDate = data.endDate || sprint.endDate;

  if (new Date(startDate) >= new Date(endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Check for overlapping active sprints if changing status to ACTIVE
  if (data.status === "ACTIVE" && sprint.status !== "ACTIVE") {
    const activeSprint = await prisma.sprint.findFirst({
      where: {
        projectId: sprint.projectId,
        status: "ACTIVE",
        id: { not: sprintId },
      },
    });

    if (activeSprint) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "Project already has an active sprint. Complete or cancel the current sprint first."
      );
    }
  }

  // Prevent editing completed or cancelled sprints
  if (sprint.status === "COMPLETED" || sprint.status === "CANCELLED") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Cannot edit completed or cancelled sprints"
    );
  }

  const updatedSprint = await prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id: sprintId },
      data: {
        name: data.name,
        goal: data.goal,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status,
      },
    });

    // Create activity log for status changes
    if (data.status && data.status !== sprint.status) {
      let activityType: any = "SPRINT_UPDATED";
      let description = `updated sprint "${sprint.name}"`;

      if (data.status === "ACTIVE") {
        activityType = "SPRINT_STARTED";
        description = `started sprint "${sprint.name}"`;
      } else if (data.status === "COMPLETED") {
        activityType = "SPRINT_COMPLETED";
        description = `completed sprint "${sprint.name}"`;
      } else if (data.status === "CANCELLED") {
        activityType = "SPRINT_CANCELLED";
        description = `cancelled sprint "${sprint.name}"`;
      }

      await tx.projectActivity.create({
        data: {
          type: activityType,
          description,
          projectId: sprint.projectId,
          userId,
          metadata: {
            sprintId: sprint.id,
            sprintName: sprint.name,
            oldStatus: sprint.status,
            newStatus: data.status,
          },
        },
      });
    }

    return updated;
  });

  return updatedSprint;
};

// Delete sprint
export const deleteSprint = async (sprintId: string, userId: string): Promise<void> => {
  // Check if sprint exists
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: true,
      backlogItems: true,
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  // Prevent deletion of active sprints
  if (sprint.status === "ACTIVE") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Cannot delete active sprint. Complete or cancel it first."
    );
  }

  // Check if sprint has tasks or backlog items
  if (sprint.tasks.length > 0 || sprint.backlogItems.length > 0) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Cannot delete sprint that contains tasks or backlog items. Move them first."
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete sprint
    await tx.sprint.delete({
      where: { id: sprintId },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "SPRINT_DELETED",
        description: `deleted sprint "${sprint.name}"`,
        projectId: sprint.projectId,
        userId,
        metadata: {
          sprintName: sprint.name,
          sprintId: sprintId,
        },
      },
    });
  });
};

// Start sprint (change status to ACTIVE)
export const startSprint = async (sprintId: string, userId: string): Promise<Sprint> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  if (sprint.status !== "PLANNED") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Only planned sprints can be started"
    );
  }

  // Check for existing active sprint
  const activeSprint = await prisma.sprint.findFirst({
    where: {
      projectId: sprint.projectId,
      status: "ACTIVE",
    },
  });

  if (activeSprint) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "Project already has an active sprint"
    );
  }

  return updateSprint(sprintId, { status: "ACTIVE" }, userId);
};

// Complete sprint
export const completeSprint = async (sprintId: string, userId: string): Promise<Sprint> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
        where: {
          status: {
            in: ["TODO", "IN_PROGRESS", "REVIEW"],
          },
        },
      },
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  if (sprint.status !== "ACTIVE") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Only active sprints can be completed"
    );
  }

  // Move incomplete tasks back to backlog (remove sprint association)
  if (sprint.tasks.length > 0) {
    await moveIncompleteTasksToBacklog(sprintId, userId);
  }

  return updateSprint(sprintId, { status: "COMPLETED" }, userId);
};

// Get sprint statistics
export const getSprintStats = async (sprintId: string): Promise<SprintStats> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
        select: {
          id: true,
          status: true,
          timeEntries: {
            select: {
              duration: true,
            },
          },
        },
      },
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  const totalTasks = sprint.tasks.length;
  const completedTasks = sprint.tasks.filter(task => task.status === "COMPLETED").length;
  const inProgressTasks = sprint.tasks.filter(task => task.status === "IN_PROGRESS").length;
  const todoTasks = sprint.tasks.filter(task => task.status === "TODO").length;

  // Calculate total time logged
  const totalTimeLogged = sprint.tasks.reduce((total, task) => {
    return total + task.timeEntries.reduce((taskTotal, entry) => {
      return taskTotal + (entry.duration || 0);
    }, 0);
  }, 0);

  // Calculate completion percentage
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate days remaining
  const now = new Date();
  const endDate = new Date(sprint.endDate);
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = now > endDate && sprint.status === "ACTIVE";

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    todoTasks,
    totalTimeLogged,
    completionPercentage,
    daysRemaining,
    isOverdue,
  };
};

// Move incomplete tasks to backlog (helper function)
export const moveIncompleteTasksToBacklog = async (
  sprintId: string,
  userId: string
): Promise<void> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
        where: {
          status: {
            in: ["TODO", "IN_PROGRESS", "REVIEW"],
          },
        },
      },
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  if (sprint.tasks.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Remove sprint association from incomplete tasks
      await tx.task.updateMany({
        where: {
          sprintId: sprintId,
          status: {
            in: ["TODO", "IN_PROGRESS", "REVIEW"],
          },
        },
        data: {
          sprintId: null,
        },
      });

      // Create activity log
      await tx.projectActivity.create({
        data: {
          type: "SPRINT_COMPLETED",
          description: `moved ${sprint.tasks.length} incomplete tasks from sprint "${sprint.name}" back to backlog`,
          projectId: sprint.projectId,
          userId,
          metadata: {
            sprintId: sprint.id,
            sprintName: sprint.name,
            movedTasksCount: sprint.tasks.length,
            taskIds: sprint.tasks.map(task => task.id),
          },
        },
      });
    });
  }
};

// Get active sprint for a project
export const getActiveSprint = async (projectId: string): Promise<Sprint | null> => {
  return prisma.sprint.findFirst({
    where: {
      projectId,
      status: "ACTIVE",
    },
    include: {
      _count: {
        select: {
          tasks: true,
          backlogItems: true,
        },
      },
    },
  });
};

// Get sprint tasks grouped by status (for Kanban board)
export const getSprintTasksGrouped = async (sprintId: string): Promise<any> => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
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
          _count: {
            select: {
              subtasks: true,
            },
          },
        },
      },
    },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  const tasksByStatus = {
    TODO: sprint.tasks.filter(task => task.status === "TODO"),
    IN_PROGRESS: sprint.tasks.filter(task => task.status === "IN_PROGRESS"),
    REVIEW: sprint.tasks.filter(task => task.status === "REVIEW"),
    COMPLETED: sprint.tasks.filter(task => task.status === "COMPLETED"),
  };

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    },
    tasksByStatus,
  };
};