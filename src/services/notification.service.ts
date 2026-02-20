// services/notification.service.ts - Complete Notification Service
import {
  PrismaClient,
  NotificationType,
  NotificationPriority,
} from "@prisma/client";

const prisma = new PrismaClient();

// ==================== NOTIFICATION CRUD ====================

/**
 * Get all notifications for a user with filters
 */
export const getUserNotifications = async (
  userId: string,
  filters: {
    read?: boolean;
    type?: NotificationType;
    priority?: NotificationPriority;
    page?: number;
    limit?: number;
  } = {}
) => {
  const { read, type, priority, page = 1, limit = 20 } = filters;
  const limitParsed = Number(limit);

  const where: any = { userId };

  if (read !== undefined) {
    where.read = read;
  }

  if (type) {
    where.type = type;
  }

  if (priority) {
    where.priority = priority;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [
        { read: "asc" }, // Unread first
        { priority: "desc" }, // High priority first
        { createdAt: "desc" }, // Newest first
      ],
      skip: (page - 1) * limitParsed,
      take: limitParsed,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get notification counts for a user
 */
export const getNotificationCounts = async (userId: string) => {
  const [unreadCount, totalCount, urgentCount] = await Promise.all([
    prisma.notification.count({
      where: { userId, read: false },
    }),
    prisma.notification.count({
      where: { userId },
    }),
    prisma.notification.count({
      where: { userId, read: false, priority: "URGENT" },
    }),
  ]);

  return {
    unreadCount,
    totalCount,
    urgentCount,
  };
};

/**
 * Mark notification as read
 */
export const markAsRead = async (notificationId: string, userId: string) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  return await prisma.notification.update({
    where: { id: notificationId },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: string) => {
  return await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
};

/**
 * Delete a notification
 */
export const deleteNotification = async (
  notificationId: string,
  userId: string
) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  return await prisma.notification.delete({
    where: { id: notificationId },
  });
};

/**
 * Delete all read notifications for a user
 */
export const deleteReadNotifications = async (userId: string) => {
  return await prisma.notification.deleteMany({
    where: {
      userId,
      read: true,
    },
  });
};

/**
 * Delete all notifications for a user
 */
export const deleteAllNotifications = async (userId: string) => {
  return await prisma.notification.deleteMany({
    where: { userId },
  });
};

// ==================== NOTIFICATION CREATION HELPERS ====================

/**
 * Generic notification creator
 */
const createNotification = async (data: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  actionUrl?: string;
  actorId?: string;
  actorName?: string;
  priority?: NotificationPriority;
  metadata?: any;
}) => {
  return await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      entityType: data.entityType as any,
      entityId: data.entityId,
      entityName: data.entityName,
      actionUrl: data.actionUrl,
      actorId: data.actorId,
      actorName: data.actorName,
      priority: data.priority || "MEDIUM",
      metadata: data.metadata,
    },
  });
};

/**
 * Create multiple notifications (for team assignments, etc.)
 */
export const createBulkNotifications = async (
  notifications: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    actionUrl?: string;
    actorId?: string;
    actorName?: string;
    priority?: NotificationPriority;
    metadata?: any;
  }>
) => {
  return await prisma.notification.createMany({
    data: notifications.map((notif) => ({
      userId: notif.userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      entityType: notif.entityType as any,
      entityId: notif.entityId,
      entityName: notif.entityName,
      actionUrl: notif.actionUrl,
      actorId: notif.actorId,
      actorName: notif.actorName,
      priority: notif.priority || "MEDIUM",
      metadata: notif.metadata,
    })),
  });
};

// ==================== SPECIFIC NOTIFICATION CREATORS ====================

/**
 * Notify when user is assigned to a project
 */
export const notifyProjectAssignment = async (
  userId: string,
  projectId: string,
  projectName: string,
  actorId: string,
  actorName: string
) => {
  return await createNotification({
    userId,
    type: "PROJECT_ASSIGNED",
    title: "New Project Assignment",
    message: `${actorName} assigned you to project "${projectName}"`,
    entityType: "PROJECT",
    entityId: projectId,
    entityName: projectName,
    actionUrl: `/projects/${projectId}`,
    actorId,
    actorName,
    priority: "HIGH",
  });
};

/**
 * Notify when user is assigned to a task
 */
export const notifyTaskAssignment = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  projectName: string,
  actorId: string,
  actorName?: string
) => {
  return await createNotification({
    userId,
    type: "TASK_ASSIGNED",
    title: "New Task Assignment",
    message: `${actorName} assigned you to task "${taskTitle}" in project "${projectName}"`,
    entityType: "TASK",
    entityId: taskId,
    entityName: taskTitle,
    actionUrl: `/tasks/${taskId}`,
    actorId,
    actorName,
    priority: "HIGH",
    metadata: { projectName },
  });
};

/**
 * Notify when user is unassigned from a task
 */
export const notifyTaskUnassignment = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  actorId: string,
  actorName: string
) => {
  return await createNotification({
    userId,
    type: "TASK_UNASSIGNED",
    title: "Task Unassignment",
    message: `${actorName} removed you from task "${taskTitle}"`,
    entityType: "TASK",
    entityId: taskId,
    entityName: taskTitle,
    actionUrl: `/tasks/${taskId}`,
    actorId,
    actorName,
    priority: "MEDIUM",
  });
};

/**
 * Notify when task status changes
 */
export const notifyTaskStatusChange = async (
  userIds: string[],
  taskId: string,
  taskTitle: string,
  oldStatus: string,
  newStatus: string,
  actorId: string,
  actorName: string
) => {
  const notifications = userIds.map((userId) => ({
    userId,
    type: "TASK_STATUS_CHANGED" as NotificationType,
    title: "Task Status Updated",
    message: `${actorName} changed task "${taskTitle}" from ${oldStatus} to ${newStatus}`,
    entityType: "TASK",
    entityId: taskId,
    entityName: taskTitle,
    actionUrl: `/tasks/${taskId}`,
    actorId,
    actorName,
    priority:
      newStatus === "COMPLETED"
        ? ("HIGH" as NotificationPriority)
        : ("NORMAL" as NotificationPriority),
    metadata: { oldStatus, newStatus },
  }));

  return await createBulkNotifications(notifications);
};

/**
 * Notify about deadline approaching
 */
export const notifyDeadlineApproaching = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  daysLeft: number
) => {
  return await createNotification({
    userId,
    type: "TASK_DEADLINE_APPROACHING",
    title: "Task Deadline Approaching",
    message: `Task "${taskTitle}" is due in ${daysLeft} day${
      daysLeft > 1 ? "s" : ""
    }`,
    entityType: "TASK",
    entityId: taskId,
    entityName: taskTitle,
    actionUrl: `/tasks/${taskId}`,
    priority: daysLeft <= 1 ? "URGENT" : daysLeft <= 3 ? "HIGH" : "MEDIUM",
    metadata: { daysLeft },
  });
};

/**
 * Notify about task overdue
 */
export const notifyTaskOverdue = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  daysOverdue: number
) => {
  return await createNotification({
    userId,
    type: "TASK_OVERDUE",
    title: "Task Overdue",
    message: `Task "${taskTitle}" is overdue by ${daysOverdue} day${
      daysOverdue > 1 ? "s" : ""
    }`,
    entityType: "TASK",
    entityId: taskId,
    entityName: taskTitle,
    actionUrl: `/tasks/${taskId}`,
    priority: "URGENT",
    metadata: { daysOverdue },
  });
};

/**
 * Notify when sprint starts
 */
export const notifySprintStarted = async (
  userIds: string[],
  sprintId: string,
  sprintName: string,
  projectName: string,
  actorId: string,
  actorName: string
) => {
  const notifications = userIds.map((userId) => ({
    userId,
    type: "SPRINT_STARTED" as NotificationType,
    title: "Sprint Started",
    message: `${actorName} started sprint "${sprintName}" in project "${projectName}"`,
    entityType: "SPRINT",
    entityId: sprintId,
    entityName: sprintName,
    actionUrl: `/sprints/${sprintId}`,
    actorId,
    actorName,
    priority: "HIGH" as NotificationPriority,
    metadata: { projectName },
  }));

  return await createBulkNotifications(notifications);
};

/**
 * Notify about budget exceeded
 */
const notifyBudgetExceeded = async (
  userIds: string[],
  projectId: string,
  projectName: string,
  budgetAmount: number,
  actualAmount: number
) => {
  const notifications = userIds.map((userId) => ({
    userId,
    type: "BUDGET_EXCEEDED" as NotificationType,
    title: "Budget Exceeded",
    message: `Project "${projectName}" has exceeded budget: $${actualAmount} / $${budgetAmount}`,
    entityType: "PROJECT",
    entityId: projectId,
    entityName: projectName,
    actionUrl: `/projects/${projectId}/budget`,
    priority: "URGENT" as NotificationPriority,
    metadata: {
      budgetAmount,
      actualAmount,
      overageAmount: actualAmount - budgetAmount,
    },
  }));

  return await createBulkNotifications(notifications);
};

/**
 * Notify when file is uploaded
 */
export const notifyFileUploaded = async (
  userIds: string[],
  fileId: string,
  fileName: string,
  projectName: string,
  actorId: string,
  actorName: string
) => {
  const notifications = userIds.map((userId) => ({
    userId,
    type: "FILE_UPLOADED" as NotificationType,
    title: "New File Uploaded",
    message: `${actorName} uploaded "${fileName}" to project "${projectName}"`,
    entityType: "FILE",
    entityId: fileId,
    entityName: fileName,
    actionUrl: `/projects/${projectName}/files`,
    actorId,
    actorName,
    priority: "NORMAL" as NotificationPriority,
    metadata: { projectName },
  }));

  return await createBulkNotifications(notifications);
};

/**
 * Notify when mentioned in a comment
 */
export const notifyMention = async (
  userId: string,
  entityType: string,
  entityId: string,
  entityName: string,
  commentText: string,
  actorId: string,
  actorName: string
) => {
  return await createNotification({
    userId,
    type: "MENTION",
    title: "You were mentioned",
    message: `${actorName} mentioned you: "${commentText.substring(
      0,
      100
    )}..."`,
    entityType,
    entityId,
    entityName,
    actionUrl: `/${entityType.toLowerCase()}s/${entityId}`,
    actorId,
    actorName,
    priority: "HIGH",
    metadata: { commentText },
  });
};

/**
 * System announcement to all active users
 */
export const createSystemAnnouncement = async (
  title: string,
  message: string,
  priority: NotificationPriority = "MEDIUM"
) => {
  const activeUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const notifications = activeUsers.map((user) => ({
    userId: user.id,
    type: "SYSTEM_ANNOUNCEMENT" as NotificationType,
    title,
    message,
    priority,
  }));

  return await createBulkNotifications(notifications);
};

// ==================== CLEANUP FUNCTIONS ====================

/**
 * Delete old read notifications (older than 30 days)
 */
export const cleanupOldNotifications = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await prisma.notification.deleteMany({
    where: {
      read: true,
      readAt: {
        lt: thirtyDaysAgo,
      },
    },
  });
};

export default {
  getUserNotifications,
  getNotificationCounts,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  deleteAllNotifications,
  createNotification,
  createBulkNotifications,
  notifyProjectAssignment,
  notifyTaskAssignment,
  notifyTaskUnassignment,
  notifyTaskStatusChange,
  notifyDeadlineApproaching,
  notifyTaskOverdue,
  notifySprintStarted,
  notifyBudgetExceeded,
  notifyFileUploaded,
  notifyMention,
  createSystemAnnouncement,
  cleanupOldNotifications,
};
