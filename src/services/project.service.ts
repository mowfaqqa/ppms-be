import { PrismaClient, Project, ProjectStatus } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Create project
export const createProject = async (
  data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    status?: ProjectStatus;
    pillarId: string;
    relatedProjectIds?: string[]; // New optional field
  },
  userId: string
): Promise<any> => {
  // Check if pillar exists
  const pillar = await prisma.pillar.findUnique({
    where: { id: data.pillarId },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  // Check start date and end date
  if (new Date(data.startDate) > new Date(data.endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date cannot be after end date"
    );
  }

  // Validate related projects if provided
  if (data.relatedProjectIds && data.relatedProjectIds.length > 0) {
    const relatedProjects = await prisma.project.findMany({
      where: {
        id: {
          in: data.relatedProjectIds,
        },
      },
    });

    if (relatedProjects.length !== data.relatedProjectIds.length) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "One or more related projects not found"
      );
    }
  }

  // Create project with creator as project member and related projects
  const project = await prisma.$transaction(async (tx) => {
    // Create project
    const newProject = await tx.project.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status || "PLANNING",
        pillarId: data.pillarId,
      },
    });

    // Get all permissions
    const permissions = await tx.permission.findMany({
      where: {
        name: {
          startsWith: "project.",
        },
      },
    });

    // Add creator as project member with all permissions
    await tx.projectMember.create({
      data: {
        userId,
        projectId: newProject.id,
        permissions: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });

    // Create project relationships if provided
    if (data.relatedProjectIds && data.relatedProjectIds.length > 0) {
      for (const relatedId of data.relatedProjectIds) {
        // Create relationship (store in one direction: smaller ID -> larger ID)
        const [fromId, toId] = [newProject.id, relatedId].sort();
        await tx.projectRelationship.create({
          data: {
            fromProjectId: fromId,
            toProjectId: toId,
          },
        });
      }
    }

    return newProject;
  });

  // Fetch the complete project with relationships
  const completeProject = await getProjectById(project.id);
  return completeProject;
};

// Get all projects (with optional filters)
export const getAllProjects = async (filters?: {
  pillarId?: string;
  status?: ProjectStatus;
  search?: string;
}): Promise<any[]> => {
  const where: any = {};

  if (filters?.pillarId) {
    where.pillarId = filters.pillarId;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.search) {
    where.name = {
      contains: filters.search,
      mode: "insensitive",
    };
  }

  return prisma.project.findMany({
    where,
    include: {
      pillar: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      },
      _count: {
        select: {
          tasks: true,
          members: true,
        },
      },
    },
    orderBy: {
      startDate: "asc",
    },
  });
};

// Get project by ID
export const getProjectById = async (id: string): Promise<any> => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pillar: {
        select: {
          id: true,
          name: true,
          portfolio: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          permissions: true,
        },
      },
      tasks: {
        where: {
          parentTaskId: null, // Only top-level tasks
        },
        include: {
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
                },
              },
            },
          },
        },
      },
      budget: {
        include: {
          allocations: true,
          expenses: true,
        },
      },
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get related projects
  const relatedProjects = await getRelatedProjects(id);

  return {
    ...project,
    relatedProjects,
  };
};

// Update project
export const updateProject = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    status?: ProjectStatus;
    pillarId?: string;
  }
): Promise<Project> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // If updating pillar, check if pillar exists
  if (data.pillarId && data.pillarId !== project.pillarId) {
    const pillar = await prisma.pillar.findUnique({
      where: { id: data.pillarId },
    });

    if (!pillar) {
      throw new ApiError(HttpStatus.NOT_FOUND, "New pillar not found");
    }
  }

  // If updating dates, check they are valid
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after end date"
      );
    }
  } else if (data.startDate && !data.endDate) {
    if (new Date(data.startDate) > new Date(project.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Start date cannot be after current end date"
      );
    }
  } else if (!data.startDate && data.endDate) {
    if (new Date(project.startDate) > new Date(data.endDate)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Current start date cannot be after end date"
      );
    }
  }

  return prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      status: data.status,
      pillarId: data.pillarId,
    },
  });
};

// Delete project
export const deleteProject = async (id: string): Promise<void> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  await prisma.project.delete({
    where: { id },
  });
};

// Add member to project
export const addProjectMember = async (
  projectId: string,
  userId: string,
  permissionIds: string[]
): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
  }

  // Check if user is already a member
  const existingMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (existingMember) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "User is already a member of this project"
    );
  }

  // Validate permissions
  if (permissionIds.length > 0) {
    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid permission IDs");
    }
  }

  return prisma.projectMember.create({
    data: {
      userId,
      projectId,
      permissions: {
        connect: permissionIds.map((id) => ({ id })),
      },
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
      permissions: true,
    },
  });
};

// Update project member permissions
export const updateProjectMemberPermissions = async (
  projectId: string,
  userId: string,
  permissionIds: string[]
): Promise<any> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!projectMember) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  // Validate permissions
  if (permissionIds.length > 0) {
    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid permission IDs");
    }
  }

  return prisma.projectMember.update({
    where: {
      id: projectMember.id,
    },
    data: {
      permissions: {
        set: permissionIds.map((id) => ({ id })),
      },
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
      permissions: true,
    },
  });
};

// Get project stats
export const getProjectStats = async (id: string) => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get task counts by status
  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    select: {
      id: true,
      status: true,
      priority: true,
    },
  });

  const tasksByStatus = {
    TODO: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    COMPLETED: 0,
    total: tasks.length,
  };

  const tasksByPriority = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  tasks.forEach((task) => {
    tasksByStatus[task.status]++;
    tasksByPriority[task.priority]++;
  });

  // Get member count
  const memberCount = await prisma.projectMember.count({
    where: { projectId: id },
  });

  // Get budget summary if exists
  let budget = null;
  const projectBudget = await prisma.budget.findUnique({
    where: { projectId: id },
    include: {
      allocations: true,
      expenses: true,
    },
  });

  if (projectBudget) {
    const totalExpenses = projectBudget.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    budget = {
      totalAmount: projectBudget.totalAmount,
      totalExpenses,
      remainingAmount: projectBudget.totalAmount - totalExpenses,
      percentUsed: (totalExpenses / projectBudget.totalAmount) * 100,
    };
  }

  // Project timeline info
  const now = new Date();
  const startDate = new Date(project.startDate);
  const endDate = new Date(project.endDate);
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsedDuration = Math.min(
    now.getTime() - startDate.getTime(),
    totalDuration
  );
  const percentComplete = (elapsedDuration / totalDuration) * 100;

  const daysRemaining = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    tasks: {
      byStatus: tasksByStatus,
      byPriority: tasksByPriority,
    },
    memberCount,
    budget,
    timeline: {
      percentComplete,
      daysRemaining,
      isOverdue: now > endDate && project.status !== "COMPLETED",
    },
  };
};

// Create project comment
export const createProjectComment = async (
  projectId: string,
  userId: string,
  content: string
): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Create comment and activity log in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create comment
    const comment = await tx.projectComment.create({
      data: {
        content,
        projectId,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "COMMENT",
        description: "added a comment",
        projectId,
        userId,
        metadata: {
          commentId: comment.id,
          content:
            content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        },
      },
    });

    return comment;
  });

  return {
    ...result,
    isEdited: false,
  };
};

// Get project comments
export const getProjectComments = async (projectId: string): Promise<any[]> => {
  const comments = await prisma.projectComment.findMany({
    where: { projectId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return comments.map((comment) => ({
    ...comment,
    isEdited: comment.updatedAt.getTime() !== comment.createdAt.getTime(),
  }));
};

// Update project comment
export const updateProjectComment = async (
  commentId: string,
  userId: string,
  content: string
): Promise<any> => {
  // Check if comment exists and belongs to user
  const comment = await prisma.projectComment.findUnique({
    where: { id: commentId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!comment) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found");
  }

  if (comment.authorId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only edit your own comments"
    );
  }

  const updatedComment = await prisma.projectComment.update({
    where: { id: commentId },
    data: { content },
    include: {
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    ...updatedComment,
    isEdited: true,
  };
};

// Delete project comment
export const deleteProjectComment = async (
  commentId: string,
  userId: string
): Promise<void> => {
  // Check if comment exists and belongs to user
  const comment = await prisma.projectComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found");
  }

  if (comment.authorId !== userId) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You can only delete your own comments"
    );
  }

  await prisma.projectComment.delete({
    where: { id: commentId },
  });
};

// Get project activity
export const getProjectActivity = async (projectId: string): Promise<any[]> => {
  const activities = await prisma.projectActivity.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50, // Limit to last 50 activities
  });

  return activities;
};

export const getProjectMembers = async (projectId: string): Promise<any[]> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  return prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      permissions: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};

// Helper function to get permissions by role
const getPermissionsByRole = async (role: string): Promise<any[]> => {
  const rolePermissionMap: { [key: string]: string[] } = {
    PROJECT_MANAGER: [
      "project.view",
      "project.edit",
      "project.delete",
      "task.create",
      "task.edit",
      "task.delete",
      "task.view",
    ],
    TEAM_MEMBER: ["project.view", "task.create", "task.edit", "task.view"],
    OBSERVER: ["project.view", "task.view"],
  };

  const permissionNames =
    rolePermissionMap[role] || rolePermissionMap["TEAM_MEMBER"];

  return prisma.permission.findMany({
    where: {
      name: {
        in: permissionNames,
      },
    },
  });
};

// Update project member role
export const updateProjectMemberRole = async (
  projectId: string,
  memberId: string,
  role: string
): Promise<any> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: { id: memberId },
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

  if (!projectMember || projectMember.projectId !== projectId) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  // Get new permissions for the role
  const rolePermissions = await getPermissionsByRole(role);
  const permissionIds = rolePermissions.map((p) => p.id);

  const result = await prisma.$transaction(async (tx) => {
    // Update member role and permissions
    const updatedMember = await tx.projectMember.update({
      where: { id: memberId },
      data: {
        permissions: {
          set: permissionIds.map((id) => ({ id })),
        },
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
        permissions: true,
      },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "MEMBER_UPDATED",
        description: `updated ${projectMember.user.name}'s role to ${role}`,
        projectId,
        userId: projectMember.userId, // This should be the current user ID in real implementation
        metadata: {
          updatedUserId: projectMember.userId,
          updatedUserName: projectMember.user.name,
          oldRole: projectMember.role,
          newRole: role,
        },
      },
    });

    return updatedMember;
  });

  return result;
};

// Update existing removeProjectMember to add activity logging
export const removeProjectMember = async (
  projectId: string,
  memberId: string
): Promise<void> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!projectMember || projectMember.projectId !== projectId) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  await prisma.$transaction(async (tx) => {
    // Delete project member
    await tx.projectMember.delete({
      where: { id: memberId },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "MEMBER_REMOVED",
        description: `removed ${projectMember.user.name} from the project`,
        projectId,
        userId: projectMember.userId, // This should be the current user ID in real implementation
        metadata: {
          removedUserId: projectMember.userId,
          removedUserName: projectMember.user.name,
        },
      },
    });
  });
};

// ==================== PROJECT RELATIONSHIP METHODS ====================

/**
 * Add related projects to a project (bidirectional)
 * @param projectId - The project to add relationships to
 * @param relatedProjectIds - Array of project IDs to relate
 * @param userId - User performing the action
 */
export const addRelatedProjects = async (
  projectId: string,
  relatedProjectIds: string[],
  userId: string
): Promise<any[]> => {
  // Validate that the main project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Validate that all related projects exist
  const relatedProjects = await prisma.project.findMany({
    where: {
      id: {
        in: relatedProjectIds,
      },
    },
  });

  if (relatedProjects.length !== relatedProjectIds.length) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "One or more related projects not found"
    );
  }

  // Prevent self-reference
  if (relatedProjectIds.includes(projectId)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "A project cannot be related to itself"
    );
  }

  // Create relationships in transaction
  const relationships = await prisma.$transaction(async (tx) => {
    const createdRelationships = [];

    for (const relatedId of relatedProjectIds) {
      // Check if relationship already exists (in either direction)
      const existingRelationship = await tx.projectRelationship.findFirst({
        where: {
          OR: [
            { fromProjectId: projectId, toProjectId: relatedId },
            { fromProjectId: relatedId, toProjectId: projectId },
          ],
        },
      });

      // Skip if relationship already exists
      if (existingRelationship) {
        continue;
      }

      // Create relationship (store in one direction: smaller ID -> larger ID for consistency)
      const [fromId, toId] = [projectId, relatedId].sort();
      const relationship = await tx.projectRelationship.create({
        data: {
          fromProjectId: fromId,
          toProjectId: toId,
        },
        include: {
          fromProject: {
            select: {
              id: true,
              name: true,
            },
          },
          toProject: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      createdRelationships.push(relationship);

      // Create activity log
      const relatedProject = relatedProjects.find((p) => p.id === relatedId);
      await tx.projectActivity.create({
        data: {
          type: "PROJECT_UPDATED",
          description: `linked project to ${relatedProject?.name}`,
          projectId,
          userId,
          metadata: {
            relatedProjectId: relatedId,
            relatedProjectName: relatedProject?.name,
          },
        },
      });
    }

    return createdRelationships;
  });

  return relationships;
};

/**
 * Remove a project relationship (bidirectional)
 * @param projectId - One of the related projects
 * @param relatedProjectId - The other related project
 * @param userId - User performing the action
 */
export const removeRelatedProject = async (
  projectId: string,
  relatedProjectId: string,
  userId: string
): Promise<void> => {
  // Find relationship (could be in either direction)
  const relationship = await prisma.projectRelationship.findFirst({
    where: {
      OR: [
        { fromProjectId: projectId, toProjectId: relatedProjectId },
        { fromProjectId: relatedProjectId, toProjectId: projectId },
      ],
    },
    include: {
      fromProject: { select: { id: true, name: true } },
      toProject: { select: { id: true, name: true } },
    },
  });

  if (!relationship) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project relationship not found");
  }

  await prisma.$transaction(async (tx) => {
    // Delete relationship
    await tx.projectRelationship.delete({
      where: { id: relationship.id },
    });

    // Create activity log
    const otherProject =
      relationship.fromProjectId === projectId
        ? relationship.toProject
        : relationship.fromProject;

    await tx.projectActivity.create({
      data: {
        type: "PROJECT_UPDATED",
        description: `unlinked project from ${otherProject.name}`,
        projectId,
        userId,
        metadata: {
          relatedProjectId: otherProject.id,
          relatedProjectName: otherProject.name,
        },
      },
    });
  });
};

/**
 * Get all related projects for a specific project
 * @param projectId - The project ID
 */
export const getRelatedProjects = async (projectId: string): Promise<any[]> => {
  // Get relationships where this project is involved (in either direction)
  const relationships = await prisma.projectRelationship.findMany({
    where: {
      OR: [{ fromProjectId: projectId }, { toProjectId: projectId }],
    },
    include: {
      fromProject: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      toProject: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Map to return the "other" project in each relationship
  return relationships.map((rel) => {
    const relatedProject =
      rel.fromProjectId === projectId ? rel.toProject : rel.fromProject;
    return {
      id: relatedProject.id,
      name: relatedProject.name,
      status: relatedProject.status,
      startDate: relatedProject.startDate,
      endDate: relatedProject.endDate,
      relationshipId: rel.id,
      createdAt: rel.createdAt,
    };
  });
};
