import { PrismaClient, TimeEntry } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Start time entry
export const startTimeEntry = async (
  data: {
    taskId: string;
    description?: string;
  },
  userId: string
): Promise<TimeEntry> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: {
      assignments: true,
    },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Check if user is assigned to the task
  const isAssigned = task.assignments.some((a) => a.userId === userId);

  if (!isAssigned) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "You must be assigned to the task to track time"
    );
  }

  // Check if user has an active time entry for this task
  const activeEntry = await prisma.timeEntry.findFirst({
    where: {
      userId,
      taskId: data.taskId,
      endTime: null,
    },
  });

  if (activeEntry) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "You already have an active time entry for this task"
    );
  }

  // Check if user has any active time entry
  const anyActiveEntry = await prisma.timeEntry.findFirst({
    where: {
      userId,
      endTime: null,
    },
    include: {
      task: {
        select: {
          title: true,
        },
      },
    },
  });

  if (anyActiveEntry) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `You have an active time entry for task: ${anyActiveEntry.task.title}. Please stop it before starting a new one.`
    );
  }

  // Create time entry
  return prisma.timeEntry.create({
    data: {
      userId,
      taskId: data.taskId,
      startTime: new Date(),
      description: data.description,
    },
  });
};

// Stop time entry
export const stopTimeEntry = async (
  id: string,
  userId: string
): Promise<TimeEntry> => {
  // Check if time entry exists and belongs to user
  const timeEntry = await prisma.timeEntry.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!timeEntry) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Time entry not found");
  }

  // Check if time entry is already stopped
  if (timeEntry.endTime) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "Time entry is already stopped");
  }

  // Update time entry with end time
  return prisma.timeEntry.update({
    where: { id },
    data: {
      endTime: new Date(),
    },
  });
};

// Update time entry
export const updateTimeEntry = async (
  id: string,
  data: {
    startTime?: Date;
    endTime?: Date;
    description?: string;
  },
  userId: string
): Promise<TimeEntry> => {
  // Check if time entry exists and belongs to user
  const timeEntry = await prisma.timeEntry.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!timeEntry) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Time entry not found");
  }

  // If updating times, validate them
  if (data.startTime && data.endTime) {
    if (new Date(data.startTime) >= new Date(data.endTime)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start time must be before end time"
      );
    }
  } else if (data.startTime && timeEntry.endTime) {
    if (new Date(data.startTime) >= new Date(timeEntry.endTime)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start time must be before end time"
      );
    }
  } else if (data.endTime && timeEntry.startTime) {
    if (new Date(timeEntry.startTime) >= new Date(data.endTime)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start time must be before end time"
      );
    }
  }

  // Update time entry
  return prisma.timeEntry.update({
    where: { id },
    data: {
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
      description: data.description,
    },
  });
};

// Delete time entry
export const deleteTimeEntry = async (
  id: string,
  userId: string
): Promise<void> => {
  // Check if time entry exists and belongs to user
  const timeEntry = await prisma.timeEntry.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!timeEntry) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Time entry not found");
  }

  await prisma.timeEntry.delete({
    where: { id },
  });
};

// Get time entries for user
export const getUserTimeEntries = async (
  userId: string,
  filters?: {
    taskId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<any[]> => {
  const where: any = {
    userId,
  };

  if (filters?.taskId) {
    where.taskId = filters.taskId;
  }

  if (filters?.projectId) {
    where.task = {
      projectId: filters.projectId,
    };
  }

  if (filters?.startDate || filters?.endDate) {
    where.startTime = {};

    if (filters?.startDate) {
      where.startTime.gte = new Date(filters.startDate);
    }

    if (filters?.endDate) {
      where.startTime.lte = new Date(filters.endDate);
    }
  }

  return prisma.timeEntry.findMany({
    where,
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      startTime: "desc",
    },
  });
};

// Get active time entry for user
export const getActiveTimeEntry = async (
  userId: string
): Promise<TimeEntry | null> => {
  return prisma.timeEntry.findFirst({
    where: {
      userId,
      endTime: null,
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
};

// Get time entries for task
export const getTaskTimeEntries = async (taskId: string): Promise<any[]> => {
  return prisma.timeEntry.findMany({
    where: {
      taskId,
    },
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
  });
};

// Get time summary for task
export const getTaskTimeSummary = async (
  taskId: string
): Promise<{
  totalDuration: number;
  userSummaries: {
    userId: string;
    userName: string;
    duration: number;
    percentage: number;
  }[];
}> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Get all time entries for the task
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      taskId,
      endTime: {
        not: null,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Calculate total duration
  let totalDuration = 0;
  const userDurations: Record<
    string,
    { userId: string; userName: string; duration: number }
  > = {};

  timeEntries.forEach((entry) => {
    if (entry.endTime) {
      const duration = entry.endTime.getTime() - entry.startTime.getTime();
      totalDuration += duration;

      // Add to user duration
      if (!userDurations[entry.userId]) {
        userDurations[entry.userId] = {
          userId: entry.userId,
          userName: entry.user.name,
          duration: 0,
        };
      }
      userDurations[entry.userId].duration += duration;
    }
  });

  // Create user summaries with percentages
  const userSummaries = Object.values(userDurations).map((user) => ({
    ...user,
    percentage: totalDuration > 0 ? (user.duration / totalDuration) * 100 : 0,
  }));

  // Sort by duration (highest first)
  userSummaries.sort((a, b) => b.duration - a.duration);

  return {
    totalDuration,
    userSummaries,
  };
};

// Get time summary for project
export const getProjectTimeSummary = async (
  projectId: string
): Promise<{
  totalDuration: number;
  taskSummaries: {
    taskId: string;
    taskTitle: string;
    duration: number;
    percentage: number;
  }[];
  userSummaries: {
    userId: string;
    userName: string;
    duration: number;
    percentage: number;
  }[];
}> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get all tasks for the project
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
    },
    select: {
      id: true,
      title: true,
    },
  });

  // Get all time entries for the project's tasks
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      task: {
        projectId,
      },
      endTime: {
        not: null,
      },
    },
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
        },
      },
    },
  });

  // Calculate total duration
  let totalDuration = 0;
  const taskDurations: Record<
    string,
    { taskId: string; taskTitle: string; duration: number }
  > = {};
  const userDurations: Record<
    string,
    { userId: string; userName: string; duration: number }
  > = {};

  timeEntries.forEach((entry) => {
    if (entry.endTime) {
      const duration = entry.endTime.getTime() - entry.startTime.getTime();
      totalDuration += duration;

      // Add to task duration
      if (!taskDurations[entry.taskId]) {
        taskDurations[entry.taskId] = {
          taskId: entry.taskId,
          taskTitle: entry.task.title,
          duration: 0,
        };
      }
      taskDurations[entry.taskId].duration += duration;

      // Add to user duration
      if (!userDurations[entry.userId]) {
        userDurations[entry.userId] = {
          userId: entry.userId,
          userName: entry.user.name,
          duration: 0,
        };
      }
      userDurations[entry.userId].duration += duration;
    }
  });

  // Create task summaries with percentages
  const taskSummaries = Object.values(taskDurations).map((task) => ({
    ...task,
    percentage: totalDuration > 0 ? (task.duration / totalDuration) * 100 : 0,
  }));

  // Create user summaries with percentages
  const userSummaries = Object.values(userDurations).map((user) => ({
    ...user,
    percentage: totalDuration > 0 ? (user.duration / totalDuration) * 100 : 0,
  }));

  // Sort by duration (highest first)
  taskSummaries.sort((a, b) => b.duration - a.duration);
  userSummaries.sort((a, b) => b.duration - a.duration);

  return {
    totalDuration,
    taskSummaries,
    userSummaries,
  };
};
