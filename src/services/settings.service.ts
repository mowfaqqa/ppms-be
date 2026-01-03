import { PrismaClient, Role, AuditAction, EntityType } from "@prisma/client";
import { hashPassword } from "../utils/password.utils";
import { ApiError, HttpStatus } from "../utils/error.utils";
import {
  generateTemporaryPassword,
  sendUserCreatedEmail,
} from "../utils/email.utils";

const prisma = new PrismaClient();

// ==================== USER MANAGEMENT ====================

/**
 * Create a new user (Admin only)
 */
export const createUser = async (
  data: {
    name: string;
    email: string;
    staffId: string;
    department?: string;
    phoneNumber?: string;
    position?: string;
    role: Role;
    portfolioIds: string[];
  },
  creatorId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  // Check if email already exists
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUserByEmail) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `A user with email "${data.email}" already exists. Staff ID: ${existingUserByEmail.staffId}, Name: ${existingUserByEmail.name}`
    );
  }

  // Check if staff ID already exists
  const existingUserByStaffId = await prisma.user.findUnique({
    where: { staffId: data.staffId },
  });

  if (existingUserByStaffId) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `A user with Staff ID "${data.staffId}" already exists. Email: ${existingUserByStaffId.email}, Name: ${existingUserByStaffId.name}`
    );
  }

  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await hashPassword(temporaryPassword);

  // Create user in transaction
  const result = await prisma.$transaction(async (tx) => {
    // create user data object to append portfolios if user is PROGRAM_MANAGER
    const userData: any = {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      staffId: data.staffId,
      department: data.department,
      role: data.role,
      isActive: true,
      temporaryPassword: true,
      joiningDate: new Date(),
      createdById: creatorId,
    };

    if (data.role === "PROGRAM_MANAGER" && data.portfolioIds?.length) {
      userData.managedPortfolios = {
        connect: data.portfolioIds.map((id) => ({ id })),
      };
    }
    // Create user
    const user = await tx.user.create({
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
        staffId: true,
        department: true,
        role: true,
        isActive: true,
        joiningDate: true,
        createdAt: true,
        updatedAt: true,
        managedPortfolios: true
      },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        userId: creatorId,
        action: AuditAction.CREATED,
        entityType: EntityType.USER,
        entityId: user.id,
        entityName: user.name,
        description: `Created user "${user.name}" (${user.email}) with role ${user.role}`,
        changes: {
          new: {
            name: user.name,
            email: user.email,
            staffId: user.staffId,
            role: user.role,
            department: user.department,
          },
        },
        ipAddress,
        userAgent,
      },
    });

    return { user, temporaryPassword };
  });

  // Send welcome email with temporary password
  // try {
  //   await sendUserCreatedEmail(
  //     result.user.email,
  //     result.user.name,
  //     result.temporaryPassword
  //   );
  // } catch (error) {
  //   console.error("Failed to send user creation email:", error);
  //   // Don't fail the entire operation if email fails
  // }

  return result.user;
};

/**
 * Get all users with optional filters
 */
export const getAllUsers = async (filters?: {
  role?: Role;
  department?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (filters?.role) {
    where.role = filters.role;
  }

  if (filters?.department) {
    where.department = filters.department;
  }

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { staffId: { contains: filters.search, mode: "insensitive" } },
      { department: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        staffId: true,
        department: true,
        role: true,
        isActive: true,
        joiningDate: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            projects: true,
            tasks: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get user by ID with details
 */
export const getUserDetails = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      staffId: true,
      department: true,
      role: true,
      isActive: true,
      joiningDate: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      temporaryPassword: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      managedPortfolios: {
        select: {
          id: true,
          name: true,
          yearId: true,
          description: true,
          programs: true,
          projects: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      },
      projects: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
      tasks: {
        include: {
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
      _count: {
        select: {
          timeEntries: true,
          projectActivities: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

/**
 * Update user
 */
export const updateUserSettings = async (
  userId: string,
  data: {
    name?: string;
    email?: string;
    staffId?: string;
    department?: string;
    phoneNumber?: string;
    position?: string;
    role?: Role;
    portfolioIds?: string[];
  },
  updaterId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      managedPortfolios: { select: { id: true } },
    },
  });

  if (!existingUser) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Check for email conflicts
  if (data.email && data.email !== existingUser.email) {
    const emailConflict = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (emailConflict) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `A user with email "${data.email}" already exists. Staff ID: ${emailConflict.staffId}, Name: ${emailConflict.name}`
      );
    }
  }

  // Check for staff ID conflicts
  if (data.staffId && data.staffId !== existingUser.staffId) {
    const staffIdConflict = await prisma.user.findUnique({
      where: { staffId: data.staffId },
    });

    if (staffIdConflict) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `A user with Staff ID "${data.staffId}" already exists. Email: ${staffIdConflict.email}, Name: ${staffIdConflict.name}`
      );
    }
  }

  // Track changes for audit log
  const changes: any = {
    old: {},
    new: {},
  };

  if (data.name && data.name !== existingUser.name) {
    changes.old.name = existingUser.name;
    changes.new.name = data.name;
  }

  if (data.email && data.email !== existingUser.email) {
    changes.old.email = existingUser.email;
    changes.new.email = data.email;
  }

  if (data.staffId && data.staffId !== existingUser.staffId) {
    changes.old.staffId = existingUser.staffId;
    changes.new.staffId = data.staffId;
  }

  if (data.department && data.department !== existingUser.department) {
    changes.old.department = existingUser.department;
    changes.new.department = data.department;
  }

  if (data.role && data.role !== existingUser.role) {
    changes.old.role = existingUser.role;
    changes.new.role = data.role;
  }

  // determine new and deleted PROGRAM_MANAGER porfolioIds
  let portfolioConnect: { id: string }[] = [];
  let portfolioDisconnect: { id: string }[] = [];

  if (data.portfolioIds && existingUser.managedPortfolios) {
    const currentIds = existingUser.managedPortfolios.map((p) => p.id);
    const newIds = data.portfolioIds;

    portfolioConnect = newIds
      .filter((id: string) => !currentIds.includes(id))
      .map((id: string) => ({ id }));

    portfolioDisconnect = currentIds
      .filter((id: string) => !newIds.includes(id))
      .map((id: string) => ({ id }));

    if (portfolioConnect.length > 0 || portfolioDisconnect.length > 0) {
      changes.old.managedPortfolios = currentIds;
      changes.new.managedPortfolios = newIds;
    }
  }

  // Update user in transaction
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        staffId: data.staffId,
        department: data.department,
        role: data.role,
        managedPortfolios: {
          connect: portfolioConnect,
          disconnect: portfolioDisconnect,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        staffId: true,
        department: true,
        role: true,
        isActive: true,
        joiningDate: true,
        createdAt: true,
        updatedAt: true,
        managedPortfolios: true
      },
    });

    // Create audit log if there are changes
    if (Object.keys(changes.new).length > 0) {
      const changeDescriptions = Object.keys(changes.new).map((key) => {
        return `${key}: "${changes.old[key]}" → "${changes.new[key]}"`;
      });

      await tx.auditLog.create({
        data: {
          userId: updaterId,
          action: AuditAction.UPDATED,
          entityType: EntityType.USER,
          entityId: userId,
          entityName: updated.name,
          description: `Updated user "${
            updated.name
          }": ${changeDescriptions.join(", ")}`,
          changes,
          ipAddress,
          userAgent,
        },
      });
    }

    return updated;
  });

  return user;
};

/**
 * Delete user (soft delete by deactivating)
 */
export const deleteUser = async (
  userId: string,
  deleterId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      staffId: true,
      role: true,
      managedPortfolios: true
    },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Prevent deleting the last admin
  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });

    if (adminCount <= 1) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot delete the last active admin user"
      );
    }
  }

  // Deactivate user and unassign from tasks/projects
  await prisma.$transaction(async (tx) => {
    // Deactivate user
    await tx.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Remove from project members
    await tx.projectMember.deleteMany({
      where: { userId },
    });

    // Remove task assignments
    await tx.taskAssignment.deleteMany({
      where: { userId },
    });

    // Stop any active timers
    await tx.activeTimer.deleteMany({
      where: { userId },
    });

    // delete managed portfolios if PROGRAM_MANAGER
    if (user.managedPortfolios.length > 0) {
      await tx.user.update({
        where: { id: userId },
        data: {
          managedPortfolios: {
            set: [], // disconnect all portfolios
          },
        },
      });
    }
    // Create audit log
    await tx.auditLog.create({
      data: {
        userId: deleterId,
        action: AuditAction.DELETED,
        entityType: EntityType.USER,
        entityId: userId,
        entityName: user.name,
        description: `Deleted user "${user.name}" (${user.email}, Staff ID: ${user.staffId})`,
        changes: {
          old: {
            name: user.name,
            email: user.email,
            staffId: user.staffId,
            role: user.role,
          },
        },
        ipAddress,
        userAgent,
      },
    });
  });
};

/**
 * Reactivate a deactivated user
 */
export const reactivateUser = async (
  userId: string,
  activatorId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  if (user.isActive) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "User is already active");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await tx.auditLog.create({
      data: {
        userId: activatorId,
        action: AuditAction.UPDATED,
        entityType: EntityType.USER,
        entityId: userId,
        entityName: user.name,
        description: `Reactivated user "${user.name}" (${user.email})`,
        changes: {
          old: { isActive: false },
          new: { isActive: true },
        },
        ipAddress,
        userAgent,
      },
    });
  });

  return getUserDetails(userId);
};

// ==================== AUDIT TRAIL ====================

/**
 * Get audit logs with filters
 */
export const getAuditLogs = async (
  filters: {
    userId?: string;
    entityType?: EntityType;
    entityId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    page?: number;
    limit?: number;
  },
  requesterId: string,
  requesterRole: Role
) => {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  const where: any = {};

  // Project managers can only see logs for their projects
  if (requesterRole === "PROJECT_MANAGER") {
    const projectIds = await prisma.projectMember.findMany({
      where: { userId: requesterId },
      select: { projectId: true },
    });

    where.OR = [
      {
        entityType: EntityType.PROJECT,
        entityId: { in: projectIds.map((p) => p.projectId) },
      },
      {
        entityType: EntityType.TASK,
        entityId: {
          in: await getProjectTaskIds(projectIds.map((p) => p.projectId)),
        },
      },
    ];
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters.entityId) {
    where.entityId = filters.entityId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) {
      where.timestamp.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.timestamp.lte = filters.endDate;
    }
  }

  if (filters.search) {
    where.OR = [
      { description: { contains: filters.search, mode: "insensitive" } },
      { entityName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            staffId: true,
            role: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Helper function to get task IDs for projects
 */
const getProjectTaskIds = async (projectIds: string[]): Promise<string[]> => {
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  return tasks.map((t) => t.id);
};

/**
 * Get audit log statistics
 */
export const getAuditStats = async (startDate?: Date, endDate?: Date) => {
  const where: any = {};

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) {
      where.timestamp.gte = startDate;
    }
    if (endDate) {
      where.timestamp.lte = endDate;
    }
  }

  const [totalLogs, logsByAction, logsByEntity, mostActiveUsers] =
    await Promise.all([
      prisma.auditLog.count({ where }),

      prisma.auditLog.groupBy({
        by: ["action"],
        where,
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
      }),

      prisma.auditLog.groupBy({
        by: ["entityType"],
        where,
        _count: { entityType: true },
        orderBy: { _count: { entityType: "desc" } },
      }),

      prisma.auditLog.groupBy({
        by: ["userId"],
        where,
        _count: { userId: true },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
    ]);

  // Get user details for most active users
  const userIds = mostActiveUsers.map((log) => log.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true },
  });

  const mostActiveUsersWithDetails = mostActiveUsers.map((log) => ({
    user: users.find((u) => u.id === log.userId),
    activityCount: log._count.userId,
  }));

  return {
    totalLogs,
    logsByAction: logsByAction.map((log) => ({
      action: log.action,
      count: log._count.action,
    })),
    logsByEntity: logsByEntity.map((log) => ({
      entityType: log.entityType,
      count: log._count.entityType,
    })),
    mostActiveUsers: mostActiveUsersWithDetails,
  };
};

/**
 * Export audit logs to CSV
 */
export const exportAuditLogs = async (filters: {
  userId?: string;
  entityType?: EntityType;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
}) => {
  const where: any = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.action) where.action = filters.action;

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) where.timestamp.gte = filters.startDate;
    if (filters.endDate) where.timestamp.lte = filters.endDate;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          staffId: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
  });

  // Convert to CSV format
  const csvHeaders = [
    "Timestamp",
    "User Name",
    "User Email",
    "Staff ID",
    "Action",
    "Entity Type",
    "Entity Name",
    "Description",
    "IP Address",
  ];

  const csvRows = logs.map((log) => [
    log.timestamp.toISOString(),
    log.user.name,
    log.user.email,
    log.user.staffId,
    log.action,
    log.entityType,
    log.entityName || "",
    log.description,
    log.ipAddress || "",
  ]);

  const csvContent = [
    csvHeaders.join(","),
    ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
};

/**
 * Create audit log entry (helper function for other services)
 */
export const createAuditLog = async (data: {
  userId: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  description: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
}) => {
  return prisma.auditLog.create({
    data,
  });
};
