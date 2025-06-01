import { PrismaClient } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Get task time entries
export const getTaskTimeEntries = async (taskId: string): Promise<any[]> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  return prisma.timeEntry.findMany({
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
      startTime: "desc",
    },
  });
};

// Get task time summary
export const getTaskTimeSummary = async (taskId: string): Promise<any> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Get total minutes
  const totalTime = await prisma.timeEntry.aggregate({
    where: { taskId },
    _sum: {
      duration: true,
    },
  });

  // Get this week's time
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
  thisWeekEnd.setHours(23, 59, 59, 999);

  const thisWeekTime = await prisma.timeEntry.aggregate({
    where: {
      taskId,
      startTime: {
        gte: thisWeekStart,
        lte: thisWeekEnd,
      },
    },
    _sum: {
      duration: true,
    },
  });

  // Get entry count
  const entryCount = await prisma.timeEntry.count({
    where: { taskId },
  });

  // Calculate days with entries
  const distinctDays = await prisma.timeEntry.findMany({
    where: { taskId },
    select: {
      startTime: true,
    },
  });

  const uniqueDays = new Set(
    distinctDays.map((entry) => entry.startTime.toISOString().split("T")[0])
  ).size;

  const totalMinutes = totalTime._sum.duration || 0;
  const thisWeekMinutes = thisWeekTime._sum.duration || 0;
  const averagePerDay =
    uniqueDays > 0 ? Math.round(totalMinutes / uniqueDays) : 0;

  return {
    totalMinutes,
    thisWeek: thisWeekMinutes,
    entryCount,
    averagePerDay,
    uniqueDays,
  };
};

// Start time tracking
export const startTimeTracking = async (
  taskId: string,
  userId: string
): Promise<any> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Check if user already has an active timer
  const activeTimer = await prisma.activeTimer.findUnique({
    where: { userId },
  });

  if (activeTimer) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "You already have an active timer. Please stop it first."
    );
  }

  // Create active timer record
  const timer = await prisma.activeTimer.create({
    data: {
      userId,
      taskId,
      startTime: new Date(),
    },
  });

  return timer;
};

// Stop time tracking
export const stopTimeTracking = async (
  taskId: string,
  userId: string,
  description?: string
): Promise<any> => {
  // Find active timer
  const activeTimer = await prisma.activeTimer.findUnique({
    where: { userId },
  });

  if (!activeTimer || activeTimer.taskId !== taskId) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "No active timer found for this task"
    );
  }

  const endTime = new Date();
  const durationMinutes = Math.floor(
    (endTime.getTime() - activeTimer.startTime.getTime()) / 1000 / 60
  );

  // Create time entry and remove active timer
  const result = await prisma.$transaction(async (tx) => {
    // Create time entry
    const timeEntry = await tx.timeEntry.create({
      data: {
        userId,
        taskId,
        startTime: activeTimer.startTime,
        endTime,
        duration: durationMinutes,
        description: description || "Time tracking session",
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

    // Remove active timer
    await tx.activeTimer.delete({
      where: { userId },
    });

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TIME_LOGGED",
        description: `logged ${Math.floor(durationMinutes / 60)}h ${
          durationMinutes % 60
        }m`,
        taskId,
        userId,
        metadata: {
          duration: durationMinutes,
          startTime: activeTimer.startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
      },
    });

    return timeEntry;
  });

  return result;
};

// Create manual time entry
export const createTimeEntry = async (
  taskId: string,
  userId: string,
  data: {
    description: string;
    startTime: Date;
    endTime: Date;
    duration: number;
  }
): Promise<any> => {
  // Check if task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });

  if (!task) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
  }

  // Validate times
  if (data.startTime >= data.endTime) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start time must be before end time"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const timeEntry = await tx.timeEntry.create({
      data: {
        userId,
        taskId,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        description: data.description,
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

    // Create task activity
    await tx.taskActivity.create({
      data: {
        type: "TIME_LOGGED",
        description: `manually logged ${Math.floor(data.duration / 60)}h ${
          data.duration % 60
        }m`,
        taskId,
        userId,
        metadata: {
          duration: data.duration,
          startTime: data.startTime.toISOString(),
          endTime: data.endTime.toISOString(),
          manual: true,
        },
      },
    });

    return timeEntry;
  });

  return result;
};

// Update time entry
export const updateTimeEntry = async (
  entryId: string,
  userId: string,
  data: {
    description?: string;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
  }
): Promise<any> => {
  // Check if entry exists and belongs to user
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Time entry not found");
  }

  if (entry.userId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only edit your own time entries"
    );
  }

  // Validate times if provided
  const startTime = data.startTime || entry.startTime;
  const endTime = data.endTime || entry.endTime;

  if (startTime >= endTime!) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start time must be before end time"
    );
  }

  return prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
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
};

// Delete time entry
export const deleteTimeEntry = async (
  entryId: string,
  userId: string
): Promise<void> => {
  // Check if entry exists and belongs to user
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Time entry not found");
  }

  if (entry.userId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only delete your own time entries"
    );
  }

  await prisma.timeEntry.delete({
    where: { id: entryId },
  });
};
