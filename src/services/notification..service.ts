import { PrismaClient, Notification, NotificationType } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import transporter from "../config/email";

const prisma = new PrismaClient();

// Create notification
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  entityId?: string,
  entityType?: string
): Promise<Notification> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Create notification
  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type,
      entityId,
      entityType,
      read: false,
    },
  });

  // Send email notification if enabled
  try {
    await sendEmailNotification(user.email, title, message);
  } catch (error) {
    console.error("Failed to send email notification:", error);
    // Continue without failing if email sending fails
  }

  return notification;
};

// Send email notification
export const sendEmailNotification = async (
  email: string,
  subject: string,
  message: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    // Email notifications not configured
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text: message,
    html: `<div>
      <h2>${subject}</h2>
      <p>${message}</p>
      <p>This is an automated notification from the Project Management System.</p>
    </div>`,
  });
};

// Get user notifications
export const getUserNotifications = async (
  userId: string,
  query?: {
    read?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{
  notifications: Notification[];
  unreadCount: number;
  total: number;
}> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Build query
  const where: any = { userId };

  if (query?.read !== undefined) {
    where.read = query.read;
  }

  // Get notifications count
  const total = await prisma.notification.count({ where });
  const unreadCount = await prisma.notification.count({
    where: {
      userId,
      read: false,
    },
  });

  // Get notifications with pagination
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip: query?.offset || 0,
    take: query?.limit || 20,
  });

  return {
    notifications,
    unreadCount,
    total,
  };
};

// Mark notification as read
export const markNotificationAsRead = async (
  id: string,
  userId: string
): Promise<Notification> => {
  // Check if notification exists and belongs to user
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!notification) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Notification not found");
  }

  // Update notification
  return prisma.notification.update({
    where: { id },
    data: {
      read: true,
    },
  });
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (
  userId: string
): Promise<{ count: number }> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Update notifications
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
    },
  });

  return { count: result.count };
};

// Delete notification
export const deleteNotification = async (
  id: string,
  userId: string
): Promise<void> => {
  // Check if notification exists and belongs to user
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!notification) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Notification not found");
  }

  await prisma.notification.delete({
    where: { id },
  });
};

// Create deadline notifications (to be run by a scheduled job)
export const createDeadlineNotifications = async (): Promise<number> => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Format dates to match only the date part (ignoring time)
  const tomorrowDate = tomorrow.toISOString().split("T")[0];

  // Find tasks with deadlines tomorrow
  const tasks = await prisma.task.findMany({
    where: {
      endDate: {
        gte: new Date(`${tomorrowDate}T00:00:00Z`),
        lt: new Date(`${tomorrowDate}T23:59:59Z`),
      },
      status: {
        not: "COMPLETED",
      },
    },
    include: {
      assignments: {
        include: {
          user: true,
        },
      },
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  let notificationCount = 0;

  // Create notifications for each task assignee
  for (const task of tasks) {
    for (const assignment of task.assignments) {
      await createNotification(
        assignment.userId,
        "Task Deadline Approaching",
        `Task "${task.title}" in project "${task.project.name}" is due tomorrow.`,
        "DEADLINE_APPROACHING",
        task.id,
        "task"
      );
      notificationCount++;
    }
  }

  // Find projects with deadlines tomorrow
  const projects = await prisma.project.findMany({
    where: {
      endDate: {
        gte: new Date(`${tomorrowDate}T00:00:00Z`),
        lt: new Date(`${tomorrowDate}T23:59:59Z`),
      },
      status: {
        not: "COMPLETED",
      },
    },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  // Create notifications for each project member
  for (const project of projects) {
    for (const member of project.members) {
      await createNotification(
        member.userId,
        "Project Deadline Approaching",
        `Project "${project.name}" is due tomorrow.`,
        "DEADLINE_APPROACHING",
        project.id,
        "project"
      );
      notificationCount++;
    }
  }

  return notificationCount;
};
