import { PrismaClient, Task, TaskStatus, Priority } from '@prisma/client';
import { ApiError, HttpStatus } from '../utils/error.utils';
import { createNotification } from './notification.service';

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
  },
  creatorId: string
): Promise<Task> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  // If parent task specified, check if it exists and belongs to the same project
  if (data.parentTaskId) {
    const parentTask = await prisma.task.findUnique({
      where: { id: data.parentTaskId },
    });

    if (!parentTask) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Parent task not found');
    }

    if (parentTask.projectId !== data.projectId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'Parent task must be in the same project'
      );
    }
  }

  // If dates specified, validate them
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'Start date cannot be after end date'
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
        'One or more assignees are not members of the project'
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
        status: data.status || 'TODO',
        priority: data.priority || 'MEDIUM',
        projectId: data.projectId,
        parentTaskId: data.parentTaskId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });

    // Create task assignments
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
            'New Task Assignment',
            `You have been assigned to task: ${task.title}`,
            'TASK_ASSIGNED',
            task.id,
            'task'
          );
        })
      );
    }

    return task;
  });

  return result;
};

// Get all tasks (with optional filters)
export const getAllTasks = async (
  filters?: {
    projectId?: string;
    status?: TaskStatus;
    priority?: Priority;
    assigneeId?: string;
    parentTaskId?: string | null;
    search?: string;
  }
): Promise<any[]> => {
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
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: filters.search,
          mode: 'insensitive',
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
        priority: 'desc',
      },
      {
        createdAt: 'desc',
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
          startTime: 'desc',
        },
      },
      files: {
        orderBy: [
          {
            versionGroup: 'asc',
          },
          {
            versionNumber: 'desc',
          },
        ],
      },
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
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
    throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
  }

  // If parent task is being changed, validate it
  if (data.parentTaskId !== undefined && data.parentTaskId !== task.parentTaskId) {
    if (data.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: data.parentTaskId },
      });

      if (!parentTask) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Parent task not found');
      }

      if (parentTask.projectId !== task.projectId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'Parent task must be in the same project'
        );
      }

      // Prevent circular references
      if (parentTask.parentTaskId === task.id) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'Circular task reference is not allowed'
        );
      }
    }
  }

  // If dates are being updated, validate them
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'Start date cannot be after end date'
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
        startDate: data.startDate === null
          ? null
          : data.startDate
            ? new Date(data.startDate)
            : undefined,
        endDate: data.endDate === null
          ? null
          : data.endDate
            ? new Date(data.endDate)
            : undefined,
        parentTaskId: data.parentTaskId === null
          ? null
          : data.parentTaskId || undefined,
      },
    });

    // Create notifications for all assignees about the update
    const assigneeIds = task.assignments.map((a) => a.userId);
    
    if (assigneeIds.length > 0 && (data.status || data.priority || data.endDate)) {
      await Promise.all(
        assigneeIds.map(async (assigneeId) => {
          // Don't notify the user who made the update
          if (assigneeId !== userId) {
            await createNotification(
              assigneeId,
              'Task Updated',
              `Task "${task.title}" has been updated`,
              'TASK_UPDATED',
              task.id,
              'task'
            );
          }
        })
      );
    }

    return updated;
  });

  return updatedTask;
};

// Delete task
export const deleteTask = async (id: string): Promise<void> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      subtasks: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
  }

  // If task has subtasks, delete them first
  if (task.subtasks.length > 0) {
    await prisma.task.deleteMany({
      where: {
        parentTaskId: id,
      },
    });
  }

  await prisma.task.delete({
    where: { id },
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
    throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'User not found');
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
      'User is not a member of the project'
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
      'User is already assigned to this task'
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
      'New Task Assignment',
      `You have been assigned to task: ${task.title}`,
      'TASK_ASSIGNED',
      taskId,
      'task'
    );

    return newAssignment;
  });

  return result;
};

// Unassign user from task
export const unassignTaskFromUser = async (
  taskId: string,
  userId: string
): Promise<void> => {
  // Check if assignment exists
  const assignment = await prisma.taskAssignment.findUnique({
    where: {
      userId_taskId: {
        userId,
        taskId,
      },
    },
  });

  if (!assignment) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'User is not assigned to this task'
    );
  }

  await prisma.taskAssignment.delete({
    where: {
      id: assignment.id,
    },
  });
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
    throw new ApiError(HttpStatus.NOT_FOUND, 'Preceding task not found');
  }

  const dependentTask = await prisma.task.findUnique({
    where: { id: dependentTaskId },
  });

  if (!dependentTask) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'Dependent task not found');
  }

  // Check if tasks are in the same project
  if (precedingTask.projectId !== dependentTask.projectId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'Tasks must be in the same project'
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
      'Dependency already exists between these tasks'
    );
  }

  // Check for circular dependencies
  const circularCheck = await checkCircularDependency(precedingTaskId, dependentTaskId);
  if (circularCheck) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'Adding this dependency would create a circular reference'
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
      'Dependency does not exist between these tasks'
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