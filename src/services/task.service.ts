import { PrismaClient, Task, TaskStatus, Priority } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { createNotification } from "./notification.service";

const prisma = new PrismaClient();

// Create task
export const createTask = async (
  data: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: Priority;
    projectId: string;
    parentTaskId?: string;
    startDate?: Date;
    endDate?: Date;
    assigneeIds?: string[];
    backlogItemId?: string;
    sprintId?: string;
  },
  creatorId: string
): Promise<Task> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  let backlogItem = null;
  if (data.backlogItemId) {
    backlogItem = await prisma.backlogItem.findUnique({
      where: { id: data.backlogItemId },
    });
    if (!backlogItem) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
    }
    if (backlogItem.projectId !== data.projectId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Backlog item must belong to the same project"
      );
    }
    if (data.sprintId) {
      const sprint = await prisma.sprint.findUnique({
        where: { id: data.sprintId },
      });
      if (!sprint) {
        throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
      }

      if (sprint.projectId !== data.projectId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Sprint must belong to the same project"
        );
      }
    }
  }
  // If parent task specified, check if it exists and belongs to the same project
  if (data.parentTaskId) {
    const parentTask = await prisma.task.findUnique({
      where: { id: data.parentTaskId },
    });

    if (!parentTask) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Parent task not found");
    }

    if (parentTask.projectId !== data.projectId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Parent task must be in the same project"
      );
    }
  }

  // If dates specified, validate them
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  }

  // Check if assignees exist and are members of the project
  const assigneeIds = data.assigneeIds || [];
  if (assigneeIds.length > 0) {
    const projectMembers = await prisma.projectMember.findMany({
      where: {
        projectId: data.projectId,
        userId: {
          in: assigneeIds,
        },
      },
    });

    if (projectMembers.length !== assigneeIds.length) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "One or more assignees are not members of the project"
      );
    }
  }

  // Create task and assignments in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create task
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || "TODO",
        priority: data.priority || "MEDIUM",
        projectId: data.projectId,
        parentTaskId: data.parentTaskId,
        backlogItemId: data.backlogItemId,
        sprintId: data.sprintId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });

    // Create task assignments
    const assigneeIds = data.assigneeIds || [];
    if (assigneeIds.length > 0) {
      await Promise.all(
        assigneeIds.map(async (userId) => {
          await tx.taskAssignment.create({
            data: {
              taskId: task.id,
              userId,
            },
          });

          // Create notification for each assignee
          await createNotification(
            userId,
            "New Task Assignment",
            `You have been assigned to task: ${task.title}`,
            "TASK_ASSIGNED",
            task.id,
            "task"
          );

          // Create task activity for assignment
          await tx.taskActivity.create({
            data: {
              type: "ASSIGNED",
              description: `assigned this task to ${userId}`, // Should get user name
              taskId: task.id,
              userId: creatorId,
              metadata: {
                assignedUserId: userId,
              },
            },
          });
        })
      );
    }

    // Create project activity log
    await tx.projectActivity.create({
      data: {
        type: "TASK_CREATED",
 description: backlogItem 
          ? `created task "${task.title}" from backlog item "${backlogItem.title}"`
          : `created task "${task.title}"`,
        projectId: data.projectId,
        userId: creatorId,
       metadata: {
          taskId: task.id,
          taskTitle: task.title,
          priority: task.priority,
          status: task.status,
          isSubtask: !!data.parentTaskId,
          backlogItemId: data.backlogItemId,
          backlogItemTitle: backlogItem?.title,
          sprintId: data.sprintId,
        },
      },
    });

    return task;
  });

  return result;
};
export const moveTaskToSprint = async (
  taskId: string,
  sprintId: string,
  userId: string
): Promise<Task> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      sprint: {
        select: { name: true },
      },
      backlogItem: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Check if sprint exists and belongs to same project
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  if (sprint.projectId !== task.projectId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Sprint and task must belong to the same project"
    );
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { sprintId },
    });

    // Also move the associated backlog item if it exists
    if (task.backlogItemId) {
      await tx.backlogItem.update({
        where: { id: task.backlogItemId },
        data: { sprintId },
      });
    }

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `moved task to sprint "${sprint.name}"`,
        taskId,
        userId,
        metadata: {
          action: "moved_to_sprint",
          sprintId: sprint.id,
          sprintName: sprint.name,
          fromSprintId: task.sprintId,
          fromSprintName: task.sprint?.name,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_MOVED_TO_SPRINT",
        description: `moved task "${task.title}" to sprint "${sprint.name}"`,
        projectId: task.projectId,
        userId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          sprintId: sprint.id,
          sprintName: sprint.name,
        },
      },
    });

    return updated;
  });

  return updatedTask;
};

export const moveTaskToBacklog = async (
  taskId: string,
  userId: string
): Promise<Task> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      sprint: {
        select: { name: true },
      },
      backlogItem: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { sprintId: null },
    });

    // Also move the associated backlog item back to product backlog
    if (task.backlogItemId) {
      await tx.backlogItem.update({
        where: { id: task.backlogItemId },
        data: { sprintId: null },
      });
    }

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `moved task back to product backlog from sprint "${task.sprint?.name}"`,
        taskId,
        userId,
        metadata: {
          action: "moved_to_backlog",
          fromSprintId: task.sprintId,
          fromSprintName: task.sprint?.name,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_MOVED_TO_BACKLOG",
        description: `moved task "${task.title}" back to product backlog`,
        projectId: task.projectId,
        userId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          fromSprintId: task.sprintId,
          fromSprintName: task.sprint?.name,
        },
      },
    });

    return updated;
  });

  return updatedTask;
};
export const getSprintTasks = async (
  sprintId: string,
  filters?: {
    status?: TaskStatus;
    priority?: Priority;
    assigneeId?: string;
  }
): Promise<any[]> => {
  const where: any = { sprintId };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.assigneeId) {
    where.assignments = {
      some: {
        userId: filters.assigneeId,
      },
    };
  }

  return prisma.task.findMany({
    where,
    include: {
      backlogItem: {
        select: {
          id: true,
          title: true,
          priority: true,
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
      _count: {
        select: {
          subtasks: true,
          timeEntries: true,
        },
      },
    },
    orderBy: [
      {
        priority: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
};

// Get backlog tasks (tasks not in any sprint)
export const getBacklogTasks = async (
  projectId: string,
  filters?: {
    status?: TaskStatus;
    priority?: Priority;
    assigneeId?: string;
    hasBacklogItem?: boolean;
  }
): Promise<any[]> => {
  const where: any = {
    projectId,
    sprintId: null, // Only tasks not in any sprint
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.assigneeId) {
    where.assignments = {
      some: {
        userId: filters.assigneeId,
      },
    };
  }

  if (filters?.hasBacklogItem !== undefined) {
    where.backlogItemId = filters.hasBacklogItem ? { not: null } : null;
  }

  return prisma.task.findMany({
    where,
    include: {
      backlogItem: {
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
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
      _count: {
        select: {
          subtasks: true,
          timeEntries: true,
        },
      },
    },
    orderBy: [
      {
        priority: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
};
export const linkTaskToBacklogItem = async (
  taskId: string,
  backlogItemId: string,
  userId: string
): Promise<Task> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Check if backlog item exists and belongs to same project
  const backlogItem = await prisma.backlogItem.findUnique({
    where: { id: backlogItemId },
  });

  if (!backlogItem) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  if (backlogItem.projectId !== task.projectId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Task and backlog item must belong to the same project"
    );
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { 
        backlogItemId,
        sprintId: backlogItem.sprintId || task.sprintId, // Inherit sprint from backlog item if available
      },
    });

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `linked task to backlog item "${backlogItem.title}"`,
        taskId,
        userId,
        metadata: {
          action: "linked_to_backlog_item",
          backlogItemId: backlogItem.id,
          backlogItemTitle: backlogItem.title,
        },
      },
    });

    return updated;
  });

  return updatedTask;
};

// Unlink task from backlog item
export const unlinkTaskFromBacklogItem = async (
  taskId: string,
  userId: string
): Promise<Task> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      backlogItem: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  if (!task.backlogItemId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Task is not linked to any backlog item"
    );
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { backlogItemId: null },
    });

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `unlinked task from backlog item "${task.backlogItem?.title}"`,
        taskId,
        userId,
        metadata: {
          action: "unlinked_from_backlog_item",
          backlogItemId: task.backlogItemId,
          backlogItemTitle: task.backlogItem?.title,
        },
      },
    });

    return updated;
  });

  return updatedTask;
};

// Get task backlog context (enhanced task details with backlog info)
export const getTaskWithBacklogContext = async (taskId: string): Promise<any> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          pillar: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      sprint: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      backlogItem: {
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
          backlogItem: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
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
          backlogItem: {
            select: {
              id: true,
              title: true,
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
              email: true,
            },
          },
        },
      },
      dependencies: {
        include: {
          precedingTask: {
            select: {
              id: true,
              title: true,
              status: true,
              backlogItem: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      dependents: {
        include: {
          dependentTask: {
            select: {
              id: true,
              title: true,
              status: true,
              backlogItem: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      timeEntries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          startTime: "desc",
        },
      },
      files: {
        orderBy: [
          {
            versionGroup: "asc",
          },
          {
            versionNumber: "desc",
          },
        ],
      },
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  return task;
};

// Bulk move tasks to sprint
export const bulkMoveTasksToSprint = async (
  taskIds: string[],
  sprintId: string,
  userId: string
): Promise<{ movedCount: number; errors: string[] }> => {
  // Validate sprint exists
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  const errors: string[] = [];
  let movedCount = 0;

  // Process each task
  for (const taskId of taskIds) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { backlogItem: true },
      });

      if (!task) {
        errors.push(`Task ${taskId} not found`);
        continue;
      }

      if (task.projectId !== sprint.projectId) {
        errors.push(`Task ${task.title} belongs to different project`);
        continue;
      }

      // Move task and its backlog item
      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: taskId },
          data: { sprintId },
        });

        if (task.backlogItemId) {
          await tx.backlogItem.update({
            where: { id: task.backlogItemId },
            data: { sprintId },
          });
        }

        // Create activity log
        await tx.projectActivity.create({
          data: {
            type: "TASK_MOVED_TO_SPRINT",
            description: `moved task "${task.title}" to sprint "${sprint.name}" (bulk operation)`,
            projectId: task.projectId,
            userId,
            metadata: {
              taskId: task.id,
              taskTitle: task.title,
              sprintId: sprint.id,
              sprintName: sprint.name,
              bulkOperation: true,
            },
          },
        });
      });

      movedCount++;
    } catch (error) {
      errors.push(`Error moving task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { movedCount, errors };
};

// Bulk move tasks to backlog
export const bulkMoveTasksToBacklog = async (
  taskIds: string[],
  userId: string
): Promise<{ movedCount: number; errors: string[] }> => {
  const errors: string[] = [];
  let movedCount = 0;

  // Process each task
  for (const taskId of taskIds) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { 
          sprint: { select: { name: true } },
          backlogItem: true 
        },
      });

      if (!task) {
        errors.push(`Task ${taskId} not found`);
        continue;
      }

      // Move task and its backlog item
      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: taskId },
          data: { sprintId: null },
        });

        if (task.backlogItemId) {
          await tx.backlogItem.update({
            where: { id: task.backlogItemId },
            data: { sprintId: null },
          });
        }

        // Create activity log
        await tx.projectActivity.create({
          data: {
            type: "TASK_MOVED_TO_BACKLOG",
            description: `moved task "${task.title}" to backlog from sprint "${task.sprint?.name}" (bulk operation)`,
            projectId: task.projectId,
            userId,
            metadata: {
              taskId: task.id,
              taskTitle: task.title,
              fromSprintName: task.sprint?.name,
              bulkOperation: true,
            },
          },
        });
      });

      movedCount++;
    } catch (error) {
      errors.push(`Error moving task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { movedCount, errors };
};

// Get tasks by backlog item
export const getTasksByBacklogItem = async (backlogItemId: string): Promise<any[]> => {
  return prisma.task.findMany({
    where: { backlogItemId },
    include: {
      sprint: {
        select: {
          id: true,
          name: true,
          status: true,
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
      _count: {
        select: {
          subtasks: true,
          timeEntries: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });
};
// Get all tasks (with optional filters)
export const getAllTasks = async (filters?: {
  projectId?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string;
  parentTaskId?: string | null;
  search?: string;
}): Promise<any[]> => {
  const where: any = {};

  if (filters?.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.assigneeId) {
    where.assignments = {
      some: {
        userId: filters.assigneeId,
      },
    };
  }

  // Filter for top-level tasks or subtasks
  if (filters?.parentTaskId === null) {
    where.parentTaskId = null;
  } else if (filters?.parentTaskId) {
    where.parentTaskId = filters.parentTaskId;
  }

  if (filters?.search) {
    where.OR = [
      {
        title: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.task.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
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
      _count: {
        select: {
          subtasks: true,
          timeEntries: true,
        },
      },
    },
    orderBy: [
      {
        priority: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
};

// Get task by ID
export const getTaskById = async (id: string): Promise<any> => {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
        },
      },
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
              email: true,
            },
          },
        },
      },
      dependencies: {
        include: {
          precedingTask: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      dependents: {
        include: {
          dependentTask: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      timeEntries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          startTime: "desc",
        },
      },
      files: {
        orderBy: [
          {
            versionGroup: "asc",
          },
          {
            versionNumber: "desc",
          },
        ],
      },
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  return task;
};

// Update task
export const updateTask = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: Priority;
    startDate?: Date | null;
    endDate?: Date | null;
    parentTaskId?: string | null;
  },
  userId: string
): Promise<Task> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignments: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // If parent task is being changed, validate it
  if (
    data.parentTaskId !== undefined &&
    data.parentTaskId !== task.parentTaskId
  ) {
    if (data.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: data.parentTaskId },
      });

      if (!parentTask) {
        throw new ApiError(HttpStatus.NOT_FOUND, "Parent task not found");
      }

      if (parentTask.projectId !== task.projectId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Parent task must be in the same project"
        );
      }

      // Prevent circular references
      if (parentTask.parentTaskId === task.id) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Circular task reference is not allowed"
        );
      }
    }
  }

  // If dates are being updated, validate them
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  }

  // Update the task
  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        startDate:
          data.startDate === null
            ? null
            : data.startDate
            ? new Date(data.startDate)
            : undefined,
        endDate:
          data.endDate === null
            ? null
            : data.endDate
            ? new Date(data.endDate)
            : undefined,
        parentTaskId:
          data.parentTaskId === null ? null : data.parentTaskId || undefined,
      },
    });

    // Create specific activity logs for different types of changes
    const activities = [];

    if (data.status && data.status !== task.status) {
      activities.push({
        type: "STATUS_CHANGED",
        description: `changed status from ${task.status} to ${data.status}`,
        metadata: {
          from: task.status,
          to: data.status,
        },
      });
    }

    if (data.priority && data.priority !== task.priority) {
      activities.push({
        type: "PRIORITY_CHANGED",
        description: `changed priority from ${task.priority} to ${data.priority}`,
        metadata: {
          from: task.priority,
          to: data.priority,
        },
      });
    }

    if (data.title && data.title !== task.title) {
      activities.push({
        type: "TASK_UPDATED",
        description: `updated task title`,
        metadata: {
          from: task.title,
          to: data.title,
        },
      });
    }

    // Create task activities
    for (const activity of activities) {
      await tx.taskActivity.create({
        data: {
          type: activity.type as any,
          description: activity.description,
          taskId: id,
          userId,
          metadata: activity.metadata,
        },
      });
    }

    // Create notifications for all assignees about the update
    const assigneeIds = task.assignments.map((a) => a.userId);

    if (assigneeIds.length > 0 && activities.length > 0) {
      await Promise.all(
        assigneeIds.map(async (assigneeId) => {
          // Don't notify the user who made the update
          if (assigneeId !== userId) {
            await createNotification(
              assigneeId,
              "Task Updated",
              `Task "${task.title}" has been updated`,
              "TASK_UPDATED",
              task.id,
              "task"
            );
          }
        })
      );
    }

    // Create project activity log
    if (activities.length > 0) {
      await tx.projectActivity.create({
        data: {
          type: "TASK_UPDATED",
          description: `updated task "${task.title}"`,
          projectId: task.projectId,
          userId,
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            changes: activities.map((a) => a.type),
          },
        },
      });
    }

    return updated;
  });

  return updatedTask;
};

// Delete task
export const deleteTask = async (id: string, userId: string): Promise<void> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      subtasks: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // If task has subtasks, delete them first
  if (task.subtasks.length > 0) {
    await prisma.task.deleteMany({
      where: {
        parentTaskId: id,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    // If task has subtasks, delete them first
    if (task.subtasks.length > 0) {
      await tx.task.deleteMany({
        where: {
          parentTaskId: id,
        },
      });
    }

    // Delete the main task
    await tx.task.delete({
      where: { id },
    });

    // Create project activity log
    await tx.projectActivity.create({
      data: {
        type: "TASK_DELETED",
        description: `deleted task "${task.title}"`,
        projectId: task.projectId,
        userId,
        metadata: {
          taskTitle: task.title,
          taskId: id,
        },
      },
    });
  });
};

// Assign user to task
export const assignTaskToUser = async (
  taskId: string,
  userId: string
): Promise<any> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Check if user is a member of the project
  const projectMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId: task.projectId,
      },
    },
  });

  if (!projectMember) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "User is not a member of the project"
    );
  }

  // Check if user is already assigned to the task
  const assignment = await prisma.taskAssignment.findUnique({
    where: {
      userId_taskId: {
        userId,
        taskId,
      },
    },
  });

  if (assignment) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "User is already assigned to this task"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Create assignment
    const newAssignment = await tx.taskAssignment.create({
      data: {
        taskId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Create notification
    await createNotification(
      userId,
      "New Task Assignment",
      `You have been assigned to task: ${task.title}`,
      "TASK_ASSIGNED",
      taskId,
      "task"
    );

    return newAssignment;
  });

  return result;
};

// Add task dependency
export const addTaskDependency = async (
  precedingTaskId: string,
  dependentTaskId: string
): Promise<any> => {
  // Check if tasks exist
  const precedingTask = await prisma.task.findUnique({
    where: { id: precedingTaskId },
  });

  if (!precedingTask) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Preceding task not found");
  }

  const dependentTask = await prisma.task.findUnique({
    where: { id: dependentTaskId },
  });

  if (!dependentTask) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Dependent task not found");
  }

  // Check if tasks are in the same project
  if (precedingTask.projectId !== dependentTask.projectId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Tasks must be in the same project"
    );
  }

  // Check if dependency already exists
  const existingDependency = await prisma.taskDependency.findUnique({
    where: {
      precedingTaskId_dependentTaskId: {
        precedingTaskId,
        dependentTaskId,
      },
    },
  });

  if (existingDependency) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "Dependency already exists between these tasks"
    );
  }

  // Check for circular dependencies
  const circularCheck = await checkCircularDependency(
    precedingTaskId,
    dependentTaskId
  );
  if (circularCheck) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Adding this dependency would create a circular reference"
    );
  }

  return prisma.taskDependency.create({
    data: {
      precedingTaskId,
      dependentTaskId,
    },
    include: {
      precedingTask: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      dependentTask: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });
};

// Remove task dependency
export const removeTaskDependency = async (
  precedingTaskId: string,
  dependentTaskId: string
): Promise<void> => {
  // Check if dependency exists
  const dependency = await prisma.taskDependency.findUnique({
    where: {
      precedingTaskId_dependentTaskId: {
        precedingTaskId,
        dependentTaskId,
      },
    },
  });

  if (!dependency) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "Dependency does not exist between these tasks"
    );
  }

  await prisma.taskDependency.delete({
    where: {
      id: dependency.id,
    },
  });
};

// Check for circular dependencies
const checkCircularDependency = async (
  startTaskId: string,
  currentTaskId: string,
  visited: Set<string> = new Set()
): Promise<boolean> => {
  // If we've reached the start task again, we have a circular dependency
  if (startTaskId === currentTaskId) {
    return true;
  }

  // If we've already visited this task in this path, no need to check again
  if (visited.has(currentTaskId)) {
    return false;
  }

  // Mark current task as visited
  visited.add(currentTaskId);

  // Get all dependencies where current task is the dependent task
  const dependencies = await prisma.taskDependency.findMany({
    where: {
      dependentTaskId: currentTaskId,
    },
    select: {
      precedingTaskId: true,
    },
  });

  // Check each preceding task for circular dependencies
  for (const dependency of dependencies) {
    const isCircular = await checkCircularDependency(
      startTaskId,
      dependency.precedingTaskId,
      new Set(visited)
    );
    if (isCircular) {
      return true;
    }
  }

  return false;
};

export const createTaskComment = async (
  taskId: string,
  userId: string,
  content: string
): Promise<any> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Create comment and activity log in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create comment
    const comment = await tx.taskComment.create({
      data: {
        content,
        taskId,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create task activity log
    await tx.taskActivity.create({
      data: {
        type: "COMMENT",
        description: "added a comment",
        taskId,
        userId,
        metadata: {
          commentId: comment.id,
          content:
            content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        },
      },
    });

    // Create project activity log
    await tx.projectActivity.create({
      data: {
        type: "COMMENT",
        description: `commented on task "${task.title}"`,
        projectId: task.projectId,
        userId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          commentId: comment.id,
        },
      },
    });

    return comment;
  });

  return {
    ...result,
    isEdited: false,
  };
};

// Get task comments
export const getTaskComments = async (taskId: string): Promise<any[]> => {
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return comments.map((comment) => ({
    ...comment,
    isEdited: comment.updatedAt.getTime() !== comment.createdAt.getTime(),
  }));
};

// Update task comment
export const updateTaskComment = async (
  commentId: string,
  userId: string,
  content: string
): Promise<any> => {
  // Check if comment exists and belongs to user
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!comment) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found");
  }

  if (comment.authorId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only edit your own comments"
    );
  }

  const updatedComment = await prisma.taskComment.update({
    where: { id: commentId },
    data: { content },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    ...updatedComment,
    isEdited: true,
  };
};

// Delete task comment
export const deleteTaskComment = async (
  commentId: string,
  userId: string
): Promise<void> => {
  // Check if comment exists and belongs to user
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found");
  }

  if (comment.authorId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only delete your own comments"
    );
  }

  await prisma.taskComment.delete({
    where: { id: commentId },
  });
};

// Get task activity
export const getTaskActivity = async (taskId: string): Promise<any[]> => {
  const activities = await prisma.taskActivity.findMany({
    where: { taskId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50, // Limit to last 50 activities
  });

  return activities;
};

export const unassignTaskFromUser = async (
  taskId: string,
  assignmentId: string // Changed from userId to assignmentId
): Promise<void> => {
  // Check if assignment exists and belongs to the task
  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
      task: {
        select: {
          id: true,
          title: true,
          projectId: true,
        },
      },
    },
  });

  if (!assignment || assignment.taskId !== taskId) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "Assignment not found for this task"
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete assignment
    await tx.taskAssignment.delete({
      where: { id: assignmentId },
    });

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "UNASSIGNED",
        description: `unassigned ${assignment.user.name} from this task`,
        taskId,
        userId: assignment.userId, // This should be the current user ID in real implementation
        metadata: {
          unassignedUserId: assignment.userId,
          unassignedUserName: assignment.user.name,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `unassigned ${assignment.user.name} from task "${assignment.task.title}"`,
        projectId: assignment.task.projectId,
        userId: assignment.userId, // This should be the current user ID
        metadata: {
          taskId: assignment.task.id,
          taskTitle: assignment.task.title,
          unassignedUserId: assignment.userId,
          unassignedUserName: assignment.user.name,
        },
      },
    });
  });
};

export const getTaskAssignments = async (taskId: string): Promise<any[]> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  const assignments = await prisma.taskAssignment.findMany({
    where: { taskId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Transform to match frontend expectations
  return assignments.map((assignment) => ({
    ...assignment,
    assignedAt: assignment.createdAt, // Frontend expects assignedAt field
  }));
};
