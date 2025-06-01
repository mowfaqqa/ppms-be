import { PrismaClient } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { createNotification } from "./notification.service";

const prisma = new PrismaClient();

// Get task assignments
export const getTaskAssignments = async (taskId: string): Promise<any[]> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  return prisma.taskAssignment.findMany({
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
      createdAt: 'asc',
    },
  });
};

// Add task assignment (wrapper around existing assignTaskToUser)
export const addTaskAssignment = async (
  taskId: string,
  userId: string
): Promise<any> => {
  // Use existing assignTaskToUser logic but return assignment with proper structure
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
  const existingAssignment = await prisma.taskAssignment.findUnique({
    where: {
      userId_taskId: {
        userId,
        taskId,
      },
    },
  });

  if (existingAssignment) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "User is already assigned to this task"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Create assignment
    const assignment = await tx.taskAssignment.create({
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
            role: true,
          },
        },
      },
    });

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "ASSIGNED",
        description: `assigned ${user.name} to this task`,
        taskId,
        userId, // This should be the current user ID in real implementation
        metadata: {
          assignedUserId: userId,
          assignedUserName: user.name,
        },
      },
    });

    // Create project activity
    await tx.projectActivity.create({
      data: {
        type: "TASK_UPDATED",
        description: `assigned ${user.name} to task "${task.title}"`,
        projectId: task.projectId,
        userId, // This should be the current user ID
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          assignedUserId: userId,
          assignedUserName: user.name,
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

    return {
      ...assignment,
      assignedAt: assignment.createdAt, // Frontend expects assignedAt field
    };
  });

  return result;
};

// Remove task assignment
export const removeTaskAssignment = async (
  taskId: string,
  assignmentId: string
): Promise<void> => {
  // Find assignment by ID and verify it belongs to the task
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
      "Assignment not found"
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
        description: `removed ${assignment.user.name} from this task`,
        taskId,
        userId: assignment.userId, // This should be the current user ID
        metadata: {
          removedUserId: assignment.userId,
          removedUserName: assignment.user.name,
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
          removedUserId: assignment.userId,
          removedUserName: assignment.user.name,
        },
      },
    });
  });
};

// Get project workloads for assignment planning
export const getProjectWorkloads = async (projectId: string): Promise<any[]> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get all project members with their current task loads
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const workloads = await Promise.all(
    members.map(async (member) => {
      // Count active tasks assigned to this user in this project
      const activeTasks = await prisma.taskAssignment.count({
        where: {
          userId: member.userId,
          task: {
            projectId,
            status: {
              in: ['TODO', 'IN_PROGRESS', 'REVIEW'],
            },
          },
        },
      });

      // Calculate total hours this week (if time tracking is implemented)
      const thisWeekStart = new Date();
      thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
      thisWeekStart.setHours(0, 0, 0, 0);

      const thisWeekEnd = new Date(thisWeekStart);
      thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
      thisWeekEnd.setHours(23, 59, 59, 999);

      const totalMinutesThisWeek = await prisma.timeEntry.aggregate({
        where: {
          userId: member.userId,
          task: {
            projectId,
          },
          startTime: {
            gte: thisWeekStart,
            lte: thisWeekEnd,
          },
        },
        _sum: {
          duration: true,
        },
      });

      const totalHours = Math.round((totalMinutesThisWeek._sum.duration || 0) / 60);

      return {
        userId: member.userId,
        user: member.user,
        activeTasks,
        totalHours,
        weeklyCapacity: 40, // Assume 40 hours per week capacity
        utilizationPercentage: Math.round((totalHours / 40) * 100),
      };
    })
  );

  return workloads;
};