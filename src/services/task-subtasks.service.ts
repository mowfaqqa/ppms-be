import { PrismaClient, TaskStatus, Priority } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Get task subtasks
export const getTaskSubtasks = async (taskId: string): Promise<any[]> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  return prisma.task.findMany({
    where: { 
      parentTaskId: taskId 
    },
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
      {
        priority: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
};

// Create subtask (wrapper around existing createTask)
export const createSubtask = async (
  data: {
    title: string;
    description?: string;
    priority?: Priority;
    projectId: string;
    parentTaskId: string;
    startDate?: Date;
    endDate?: Date;
  },
  creatorId: string
): Promise<any> => {
  // Check if parent task exists
  const parentTask = await prisma.task.findUnique({
    where: { id: data.parentTaskId },
    include: { project: true },
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

  // Validate dates
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  }

  // Create subtask in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create subtask
    const subtask = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: "TODO" as TaskStatus,
        priority: data.priority || "MEDIUM",
        projectId: data.projectId,
        parentTaskId: data.parentTaskId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
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
    });

    // Create task activity for parent task
    await tx.taskActivity.create({
      data: {
        type: "SUBTASK_CREATED",
        description: `created subtask "${subtask.title}"`,
        taskId: data.parentTaskId,
        userId: creatorId,
        metadata: {
          subtaskId: subtask.id,
          subtaskTitle: subtask.title,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_CREATED",
        description: `created subtask "${subtask.title}" under "${parentTask.title}"`,
        projectId: data.projectId,
        userId: creatorId,
        metadata: {
          taskId: subtask.id,
          taskTitle: subtask.title,
          parentTaskId: data.parentTaskId,
          parentTaskTitle: parentTask.title,
          isSubtask: true,
        },
      },
    });

    return subtask;
  });

  return result;
};