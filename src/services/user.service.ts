import { PrismaClient, Role, User } from "@prisma/client";
import { hashPassword, comparePassword } from "../utils/password.utils";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Get all users
export const getAllUsers = async (): Promise<Partial<User>[]> => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return users;
};

// Get user by ID
export const getUserById = async (id: string): Promise<Partial<User>> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      projects: {
        select: {
          id: true,
          project: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          permissions: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      tasks: {
        select: {
          id: true,
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

// Update user
export const updateUser = async (
  userId: string,
  data: {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    role?: Role;
  }
) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // If updating email, check if new email is already taken
  if (data.email && data.email !== existingUser.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (emailTaken) {
      throw new ApiError(HttpStatus.CONFLICT, "Email already in use");
    }
  }

  // If updating password, verify current password first
  let hashedNewPassword: string | undefined;
  if (data.newPassword) {
    if (!data.currentPassword) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Current password is required to change password"
      );
    }

    // Verify current password
    const isPasswordValid = await comparePassword(
      data.currentPassword,
      existingUser.password
    );

    if (!isPasswordValid) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
    }

    // Hash new password
    hashedNewPassword = await hashPassword(data.newPassword);
  }

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      email: data.email,
      password: hashedNewPassword,
    },
    select: {
      id: true,
      email: true,
      name: true,
      staffId: true,
      department: true,
      role: true,
      isActive: true,
      joiningDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updatedUser;
};

// Delete user
export const deleteUser = async (id: string): Promise<void> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  await prisma.user.delete({
    where: { id },
  });
};

// Get user workload
export const getUserWorkload = async (userId: string) => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Count active projects
  const projectCount = await prisma.projectMember.count({
    where: {
      userId,
      project: {
        status: {
          in: ["PLANNING", "IN_PROGRESS"],
        },
      },
    },
  });

  // Count active tasks
  const taskCount = await prisma.taskAssignment.count({
    where: {
      userId,
      task: {
        status: {
          in: ["TODO", "IN_PROGRESS"],
        },
      },
    },
  });

  // Get time entries for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startTime: {
        gte: thirtyDaysAgo,
      },
    },
  });

  // Calculate total hours worked
  let totalHours = 0;

  timeEntries.forEach((entry) => {
    if (entry.endTime) {
      const durationMs = entry.endTime.getTime() - entry.startTime.getTime();
      totalHours += durationMs / (1000 * 60 * 60);
    }
  });

  return {
    projectCount,
    taskCount,
    timeTracking: {
      entriesLast30Days: timeEntries.length,
      totalHoursLast30Days: totalHours,
    },
    isOverloaded: projectCount > 3 || taskCount > 3,
  };
};
