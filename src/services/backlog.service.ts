import { PrismaClient, BacklogItem, BacklogStatus, Task } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

export interface CreateBacklogItemData {
  title: string;
  description?: string;
  priority?: number;
  status?: BacklogStatus;
}

export interface UpdateBacklogItemData {
  title?: string;
  description?: string;
  priority?: number;
  status?: BacklogStatus;
}

export interface ItemOrder {
  id: string;
  priority: number;
}

export interface CreateTaskFromBacklogData {
  title?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

// Create backlog item
export const createBacklogItem = async (
  projectId: string,
  data: CreateBacklogItemData,
  userId: string
): Promise<BacklogItem> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get the next priority number if not specified
  let priority = data.priority;
  if (priority === undefined) {
    const lastItem = await prisma.backlogItem.findFirst({
      where: { projectId },
      orderBy: { priority: "desc" },
      select: { priority: true },
    });
    priority = (lastItem?.priority || 0) + 1;
  }

  // Create backlog item in transaction
  const backlogItem = await prisma.$transaction(async (tx) => {
    const newItem = await tx.backlogItem.create({
      data: {
        title: data.title.trim(),
        description: data.description?.trim(),
        priority,
        status: data.status || "TODO",
        projectId,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    // Create project activity log
    await tx.projectActivity.create({
      data: {
        type: "BACKLOG_ITEM_CREATED",
        description: `created backlog item "${newItem.title}"`,
        projectId,
        userId,
        metadata: {
          backlogItemId: newItem.id,
          backlogItemTitle: newItem.title,
          priority: newItem.priority,
        },
      },
    });

    return newItem;
  });

  return backlogItem;
};

// Get product backlog (items not in any sprint)
export const getProductBacklog = async (projectId: string): Promise<any[]> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  return prisma.backlogItem.findMany({
    where: {
      projectId,
      sprintId: null, // Only items not assigned to any sprint
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
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
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "desc" },
        ],
      },
      _count: {
        select: {
          tasks: true,
        },
      },
    },
    orderBy: {
      priority: "asc", // Lower priority number = higher priority
    },
  });
};

// Get sprint backlog (items assigned to a specific sprint)
export const getSprintBacklog = async (sprintId: string): Promise<any[]> => {
  // Check if sprint exists
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  return prisma.backlogItem.findMany({
    where: {
      sprintId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
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
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "desc" },
        ],
      },
      _count: {
        select: {
          tasks: true,
        },
      },
    },
    orderBy: {
      priority: "asc",
    },
  });
};

// Get all backlog items for a project (both product and sprint backlogs)
export const getAllBacklogItems = async (
  projectId: string,
  filters?: {
    status?: BacklogStatus;
    sprintId?: string | null;
    search?: string;
  }
): Promise<any[]> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  const where: any = { projectId };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.sprintId !== undefined) {
    where.sprintId = filters.sprintId;
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

  return prisma.backlogItem.findMany({
    where,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      sprint: {
        select: {
          id: true,
          name: true,
          status: true,
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
        },
      },
      _count: {
        select: {
          tasks: true,
        },
      },
    },
    orderBy: {
      priority: "asc",
    },
  });
};

// Get backlog item by ID
export const getBacklogItemById = async (itemId: string): Promise<any> => {
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      sprint: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
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
          { createdAt: "desc" },
        ],
      },
    },
  });

  if (!item) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  return item;
};

// Update backlog item
export const updateBacklogItem = async (
  itemId: string,
  data: UpdateBacklogItemData,
  userId: string
): Promise<BacklogItem> => {
  // Check if item exists
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.backlogItem.update({
      where: { id: itemId },
      data: {
        title: data.title?.trim(),
        description: data.description?.trim(),
        priority: data.priority,
        status: data.status,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    // Create activity log for significant changes
    const activities = [];

    if (data.status && data.status !== item.status) {
      activities.push({
        type: "BACKLOG_ITEM_UPDATED",
        description: `changed backlog item "${item.title}" status from ${item.status} to ${data.status}`,
        metadata: {
          backlogItemId: item.id,
          backlogItemTitle: item.title,
          oldStatus: item.status,
          newStatus: data.status,
        },
      });
    }

    if (data.priority !== undefined && data.priority !== item.priority) {
      activities.push({
        type: "BACKLOG_REORDERED",
        description: `changed backlog item "${item.title}" priority from ${item.priority} to ${data.priority}`,
        metadata: {
          backlogItemId: item.id,
          backlogItemTitle: item.title,
          oldPriority: item.priority,
          newPriority: data.priority,
        },
      });
    }

    if (data.title && data.title !== item.title) {
      activities.push({
        type: "BACKLOG_ITEM_UPDATED",
        description: `updated backlog item title`,
        metadata: {
          backlogItemId: item.id,
          oldTitle: item.title,
          newTitle: data.title,
        },
      });
    }

    // Create activity logs
    for (const activity of activities) {
      await tx.projectActivity.create({
        data: {
          type: activity.type as any,
          description: activity.description,
          projectId: item.projectId,
          userId,
          metadata: activity.metadata,
        },
      });
    }

    return updated;
  });

  return updatedItem;
};

// Delete backlog item
export const deleteBacklogItem = async (itemId: string, userId: string): Promise<void> => {
  // Check if item exists
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      tasks: true,
    },
  });

  if (!item) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  // Check if item has associated tasks
  if (item.tasks.length > 0) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Cannot delete backlog item that has associated tasks. Delete tasks first or move them to another backlog item."
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete backlog item
    await tx.backlogItem.delete({
      where: { id: itemId },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "BACKLOG_ITEM_DELETED",
        description: `deleted backlog item "${item.title}"`,
        projectId: item.projectId,
        userId,
        metadata: {
          backlogItemTitle: item.title,
          backlogItemId: itemId,
        },
      },
    });
  });
};

// Reorder backlog items (bulk priority update)
export const reorderBacklogItems = async (
  projectId: string,
  itemOrders: ItemOrder[],
  userId: string
): Promise<void> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Validate all items belong to the project
  const itemIds = itemOrders?.map(order => order.id);
  const items = await prisma.backlogItem.findMany({
    where: {
      id: { in: itemIds },
      projectId,
    },
    select: { id: true },
  });

  if (items.length !== itemIds.length) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "One or more backlog items don't belong to this project"
    );
  }

  // Update priorities in transaction
  await prisma.$transaction(async (tx) => {
    // Update each item's priority
    for (const order of itemOrders) {
      await tx.backlogItem.update({
        where: { id: order.id },
        data: { priority: order.priority },
      });
    }

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "BACKLOG_REORDERED",
        description: `reordered ${itemOrders?.length} backlog items`,
        projectId,
        userId,
        metadata: {
          reorderedItems: itemOrders as any,
        },
      },
    });
  });
};

// Move backlog item to sprint
export const moveItemToSprint = async (
  itemId: string,
  sprintId: string,
  userId: string
): Promise<BacklogItem> => {
  // Check if item exists
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  // Check if sprint exists and belongs to same project
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
  });

  if (!sprint) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Sprint not found");
  }

  if (sprint.projectId !== item.projectId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Sprint and backlog item must belong to the same project"
    );
  }

  // Check if sprint is active or planned
  if (sprint.status !== "ACTIVE" && sprint.status !== "PLANNED") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Can only move items to active or planned sprints"
    );
  }

  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.backlogItem.update({
      where: { id: itemId },
      data: { sprintId },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        sprint: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    // Also move associated tasks to the sprint
    await tx.task.updateMany({
      where: { backlogItemId: itemId },
      data: { sprintId },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "BACKLOG_ITEM_MOVED_TO_SPRINT",
        description: `moved backlog item "${item.title}" to sprint "${sprint.name}"`,
        projectId: item.projectId,
        userId,
        metadata: {
          backlogItemId: item.id,
          backlogItemTitle: item.title,
          sprintId: sprint.id,
          sprintName: sprint.name,
        },
      },
    });

    return updated;
  });

  return updatedItem;
};

// Move backlog item back to product backlog (remove from sprint)
export const moveItemToBacklog = async (
  itemId: string,
  userId: string
): Promise<BacklogItem> => {
  // Check if item exists
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      sprint: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!item) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  if (!item.sprintId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Backlog item is already in product backlog"
    );
  }

  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.backlogItem.update({
      where: { id: itemId },
      data: { sprintId: null },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    // Also remove sprint association from tasks
    await tx.task.updateMany({
      where: { backlogItemId: itemId },
      data: { sprintId: null },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "BACKLOG_ITEM_MOVED_TO_BACKLOG",
        description: `moved backlog item "${item.title}" back to product backlog from sprint "${item.sprint?.name}"`,
        projectId: item.projectId,
        userId,
        metadata: {
          backlogItemId: item.id,
          backlogItemTitle: item.title,
          fromSprintId: item.sprintId,
          fromSprintName: item.sprint?.name,
        },
      },
    });

    return updated;
  });

  return updatedItem;
};

// Create task from backlog item
export const createTaskFromBacklogItem = async (
  itemId: string,
  taskData: CreateTaskFromBacklogData,
  userId: string
): Promise<Task> => {
  // Check if backlog item exists
  const backlogItem = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      sprint: true,
    },
  });

  if (!backlogItem) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Backlog item not found");
  }

  // Validate assignees if provided
  const assigneeIds = taskData.assigneeIds || [];
  if (assigneeIds.length > 0) {
    const projectMembers = await prisma.projectMember.findMany({
      where: {
        projectId: backlogItem.projectId,
        userId: { in: assigneeIds },
      },
    });

    if (projectMembers.length !== assigneeIds.length) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "One or more assignees are not members of the project"
      );
    }
  }

  // Validate dates
  if (taskData.startDate && taskData.endDate) {
    if (new Date(taskData.startDate) > new Date(taskData.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    // Create task
    const newTask = await tx.task.create({
      data: {
        title: taskData.title || backlogItem.title,
        description: taskData.description || backlogItem.description,
        priority: taskData.priority || "MEDIUM",
        status: "TODO",
        projectId: backlogItem.projectId,
        backlogItemId: itemId,
        sprintId: backlogItem.sprintId, // Inherit sprint from backlog item
        startDate: taskData.startDate ? new Date(taskData.startDate) : null,
        endDate: taskData.endDate ? new Date(taskData.endDate) : null,
      },
    });

    // Create task assignments
    if (assigneeIds.length > 0) {
      await Promise.all(
        assigneeIds.map(async (assigneeUserId) => {
          await tx.taskAssignment.create({
            data: {
              taskId: newTask.id,
              userId: assigneeUserId,
            },
          });
        })
      );
    }

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TASK_CREATED",
        description: `created task from backlog item "${backlogItem.title}"`,
        taskId: newTask.id,
        userId,
        metadata: {
          backlogItemId: itemId,
          backlogItemTitle: backlogItem.title,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_CREATED",
        description: `created task "${newTask.title}" from backlog item "${backlogItem.title}"`,
        projectId: backlogItem.projectId,
        userId,
        metadata: {
          taskId: newTask.id,
          taskTitle: newTask.title,
          backlogItemId: itemId,
          backlogItemTitle: backlogItem.title,
          fromBacklogItem: true,
        },
      },
    });

    return newTask;
  });

  return task;
};

// Get backlog item statistics
export const getBacklogStats = async (projectId: string): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get backlog item counts by status
  const itemsByStatus = await prisma.backlogItem.groupBy({
    by: ['status'],
    where: { projectId },
    _count: { status: true },
  });

  // Get sprint vs product backlog counts
  const sprintBacklogCount = await prisma.backlogItem.count({
    where: {
      projectId,
      sprintId: { not: null },
    },
  });

  const productBacklogCount = await prisma.backlogItem.count({
    where: {
      projectId,
      sprintId: null,
    },
  });

  // Get total tasks created from backlog items
  const tasksFromBacklog = await prisma.task.count({
    where: {
      projectId,
      backlogItemId: { not: null },
    },
  });

  const statusCounts = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    CANCELLED: 0,
  };

  itemsByStatus.forEach(item => {
    statusCounts[item.status] = item._count.status;
  });

  return {
    byStatus: statusCounts,
    totalItems: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    productBacklogCount,
    sprintBacklogCount,
    tasksFromBacklog,
  };
};