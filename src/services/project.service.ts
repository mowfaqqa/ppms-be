import {
  ActivityType,
  PrismaClient,
  Project,
  ProjectMemberRole,
  ProjectStatus,
  Role,
} from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { notifyProjectAssignment, notifyMention } from "./notification.service";
import { getRoleDefaultPermissions } from "../utils/helpers";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";

const prisma = new PrismaClient();

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine resource type based on mime type
    const isImage = file.mimetype.startsWith("image/");
    // const isPdf = file.mimetype === "application/pdf";
    // const isDocument =
    //   file.mimetype.includes("word") ||
    //   file.mimetype.includes("document") ||
    //   file.mimetype.includes("spreadsheet") ||
    //   file.mimetype.includes("excel");

    return {
      folder: "project-files",
      resource_type: isImage ? "image" : "raw",
      allowed_formats: [
        "jpg",
        "png",
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "txt",
      ],
      public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Create project
/**
 * Create a new project
 * Can be standalone (programId = null) or under a program (programId set)
 */
export const createProject = async (
  data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    status?: ProjectStatus;
    portfolioId: string;
    programId?: string | null;
    relatedProjectIds?: string[];
  },
  userId: string
): Promise<Project> => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: data.portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // If programId is provided, check if program exists and belongs to the same portfolio
  if (data.programId) {
    const program = await prisma.program.findUnique({
      where: { id: data.programId },
    });

    if (!program) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
    }

    if (program.portfolioId !== data.portfolioId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Program does not belong to the specified portfolio"
      );
    }
  }

  // Check if project with same name already exists in this portfolio
  const existingProject = await prisma.project.findFirst({
    where: {
      name: data.name,
      portfolioId: data.portfolioId,
    },
  });

  if (existingProject) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Project with name '${data.name}' already exists in this portfolio`
    );
  }

  // Validate dates
  if (new Date(data.startDate) > new Date(data.endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Create project
  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status || ProjectStatus.PLANNING,
      portfolioId: data.portfolioId,
      programId: data.programId,
    },
    include: {
      portfolio: true,
      program: true,
    },
  });

  // Log activity
  await prisma.projectActivity.create({
    data: {
      type: ActivityType.PROJECT_CREATED,
      description: `Project "${project.name}" created${
        project.programId ? " under program" : " as standalone"
      }`,
      projectId: project.id,
      userId: userId,
      metadata: {
        status: project.status,
        programId: project.programId,
      },
    },
  });

  return project;
};

/**
 * Get all projects with optional filters
 */
export const getAllProjects = async (filters?: {
  portfolioId?: string;
  programId?: string;
  status?: ProjectStatus;
  search?: string;
  standalone?: boolean; // Filter for standalone projects only
}) => {
  const where: any = {};

  if (filters?.portfolioId) {
    where.portfolioId = filters.portfolioId;
  }

  if (filters?.programId) {
    where.programId = filters.programId;
  }

  // Filter for standalone projects
  if (filters?.standalone === true) {
    where.programId = null;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return prisma.project.findMany({
    where,
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      program: true,
      _count: {
        select: {
          tasks: true,
          members: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Get project by ID
 */
export const getProjectById = async (id: string) => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      program: true,
      tasks: {
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  staffId: true,
                },
              },
            },
          },
          _count: {
            select: {
              subtasks: true,
              comments: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      members: {
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
          permissions: true,
        },
      },
      _count: {
        select: {
          tasks: true,
          members: true,
          files: true,
          comments: true,
        },
      },
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  return project;
};

/**
 * Update project
 */
export const updateProject = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    status?: ProjectStatus;
    portfolioId?: string;
    programId?: string | null; // Can be set to null to make it standalone
  },
  userId: string,
  userRole: Role
): Promise<Project> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      portfolio: true,
      program: true,
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Only ADMIN can change portfolio or program
  const isChangingPortfolio =
    data.portfolioId && data.portfolioId !== project.portfolioId;
  const isChangingProgram =
    data.programId !== undefined && data.programId !== project.programId;

  if ((isChangingPortfolio || isChangingProgram) && userRole !== Role.ADMIN) {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "Only administrators can move projects between portfolios or programs"
    );
  }

  // If changing portfolio, check if target portfolio exists
  if (isChangingPortfolio) {
    const targetPortfolio = await prisma.portfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!targetPortfolio) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Target portfolio not found");
    }

    // If project has a programId or new programId is provided,
    // ensure program belongs to target portfolio
    const targetProgramId =
      data.programId !== undefined ? data.programId : project.programId;

    if (targetProgramId) {
      const targetProgram = await prisma.program.findUnique({
        where: { id: targetProgramId },
      });

      if (!targetProgram) {
        throw new ApiError(HttpStatus.NOT_FOUND, "Target program not found");
      }

      if (targetProgram.portfolioId !== data.portfolioId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Program does not belong to the target portfolio. Please set programId to null or choose a program in the target portfolio."
        );
      }
    }
  }

  // If changing program, validate it
  if (isChangingProgram && data.programId !== null) {
    const targetProgram = await prisma.program.findUnique({
      where: { id: data.programId },
    });

    if (!targetProgram) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Target program not found");
    }

    // Ensure program belongs to current or target portfolio
    const targetPortfolioId = data.portfolioId || project.portfolioId;
    if (targetProgram.portfolioId !== targetPortfolioId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Program does not belong to the project's portfolio"
      );
    }
  }

  // If updating name, check if new name already exists in the same portfolio
  if (data.name && data.name !== project.name) {
    const targetPortfolioId = data.portfolioId || project.portfolioId;
    const existingProject = await prisma.project.findFirst({
      where: {
        name: data.name,
        portfolioId: targetPortfolioId,
        id: { not: id },
      },
    });

    if (existingProject) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Project with name '${data.name}' already exists in this portfolio`
      );
    }
  }

  // Validate dates if both are provided
  const startDate = data.startDate || project.startDate;
  const endDate = data.endDate || project.endDate;

  if (new Date(startDate) > new Date(endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Build changes object for activity log
  const changes: any = {};
  if (data.name && data.name !== project.name) changes.name = data.name;
  if (data.status && data.status !== project.status)
    changes.status = data.status;
  if (isChangingPortfolio) changes.portfolioId = data.portfolioId;
  if (isChangingProgram) changes.programId = data.programId;

  // Update project
  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      portfolioId: data.portfolioId,
      programId: data.programId,
    },
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      program: true,
    },
  });

  // Log activity
  let activityDescription = `Project "${updatedProject.name}" updated`;
  if (isChangingProgram) {
    if (data.programId === null) {
      activityDescription = `Project "${updatedProject.name}" changed to standalone`;
    } else {
      activityDescription = `Project "${updatedProject.name}" moved to program`;
    }
  }

  await prisma.projectActivity.create({
    data: {
      type: ActivityType.PROJECT_UPDATED,
      description: activityDescription,
      projectId: updatedProject.id,
      userId: userId,
      metadata: changes,
    },
  });

  return updatedProject;
};

/**
 * Delete project
 * Note: This will cascade delete all tasks and related data
 */
export const deleteProject = async (id: string): Promise<void> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Warn if project has tasks
  if (project._count.tasks > 0) {
    console.warn(
      `Deleting project "${project.name}" with ${project._count.tasks} tasks`
    );
  }

  await prisma.project.delete({
    where: { id },
  });
};

/**
 * Move project to a different program (Admin only)
 */
export const moveProjectToProgram = async (
  projectId: string,
  targetProgramId: string | null, // null means make it standalone
  userId: string
): Promise<Project> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      portfolio: true,
      program: true,
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // If moving to a program, validate it
  if (targetProgramId !== null) {
    const targetProgram = await prisma.program.findUnique({
      where: { id: targetProgramId },
    });

    if (!targetProgram) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Target program not found");
    }

    // Ensure program belongs to same portfolio
    if (targetProgram.portfolioId !== project.portfolioId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot move project to a program in a different portfolio. Please move the project to the target portfolio first."
      );
    }
  }

  // Update project
  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: { programId: targetProgramId },
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      program: true,
    },
  });

  // Log activity
  let activityDescription;
  if (targetProgramId === null) {
    activityDescription = `Project "${project.name}" changed to standalone`;
  } else {
    activityDescription = `Project "${project.name}" moved to program "${updatedProject.program?.name}"`;
  }

  await prisma.projectActivity.create({
    data: {
      type: ActivityType.PROJECT_UPDATED,
      description: activityDescription,
      projectId: projectId,
      userId: userId,
      metadata: {
        fromProgram: project.program?.name || "standalone",
        toProgram: updatedProject.program?.name || "standalone",
      },
    },
  });

  return updatedProject;
};

/**
 * Move project to a different portfolio (Admin only)
 * This also removes it from any program
 */
export const moveProjectToPortfolio = async (
  projectId: string,
  targetPortfolioId: string,
  userId: string
): Promise<Project> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      portfolio: true,
      program: true,
    },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Check if target portfolio exists
  const targetPortfolio = await prisma.portfolio.findUnique({
    where: { id: targetPortfolioId },
  });

  if (!targetPortfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Target portfolio not found");
  }

  // Check if project name already exists in target portfolio
  const existingProject = await prisma.project.findFirst({
    where: {
      name: project.name,
      portfolioId: targetPortfolioId,
      id: { not: projectId },
    },
  });

  if (existingProject) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Project with name '${project.name}' already exists in target portfolio`
    );
  }

  // Update project (remove program when changing portfolio)
  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: {
      portfolioId: targetPortfolioId,
      programId: null, // Remove from program when changing portfolio
    },
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      program: true,
    },
  });

  // Log activity
  await prisma.projectActivity.create({
    data: {
      type: ActivityType.PROJECT_UPDATED,
      description: `Project "${project.name}" moved to portfolio "${targetPortfolio.name}"`,
      projectId: projectId,
      userId: userId,
      metadata: {
        fromPortfolio: project.portfolio.name,
        toPortfolio: targetPortfolio.name,
      },
    },
  });

  return updatedProject;
};

// Add member to project
export const addProjectMember = async (
  projectId: string,
  userId: string,
  permissionIds: string[] | undefined, // Now optional
  currentUserId: string,
  role: ProjectMemberRole
): Promise<any> => {
  // Auto-assign permissions based on role if not provided
  let finalPermissionIds = permissionIds;

  if (!permissionIds || permissionIds.length === 0) {
    const rolePermissions = await getRoleDefaultPermissions(role);
    finalPermissionIds = rolePermissions.map((p) => p.id);
  }

  await prisma.projectMember.create({
    data: {
      projectId,
      userId,
      role,
      permissions: {
        connect: finalPermissionIds.map((id) => ({ id })),
      },
    },
    include: {
      user: true,
      permissions: true,
    },
  });
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
  // Check if user is already assigned to 3 or more projects
  const userProjectCount = await prisma.projectMember.count({
    where: {
      userId: userId,
    },
  });

  if (userProjectCount >= 3) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "User cannot be added to more than 3 projects"
    );
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
  console.log(permissionIds);
  // Validate permissions
  if (permissionIds?.length > 0) {
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

  const result = await prisma.projectMember.create({
    data: {
      userId,
      projectId,
      role,
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
  try {
    const actorId = currentUserId || userId; // Use currentUserId if provided, fallback to userId
    const currentUser = await prisma.user.findUnique({
      where: { id: actorId },
    });

    await notifyProjectAssignment(
      userId,
      projectId,
      project.name,
      actorId,
      currentUser?.name || "System"
    );
  } catch (error) {
    console.error("Failed to create project assignment notification:", error);
  }

  return result;
};

// Update project member permissions
export const updateProjectMemberPermissions = async (
  projectId: string,
  userId: string,
  permissionIds: string[],
  role?: ProjectMemberRole
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
  const updateData: any = {
    permissions: { set: permissionIds.map((id) => ({ id })) },
  };

  if (role) {
    updateData.role = role; // 👈 ADD THIS
  }
  return prisma.projectMember.update({
    where: {
      id: projectMember.id,
    },
    data: updateData,
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
  // Extract mentions from comment content (e.g., @username)
  const mentionPattern = /@(\w+)/g;
  const mentions = content.match(mentionPattern);

  if (mentions && mentions.length > 0) {
    try {
      // Get project members to find mentioned users
      const projectMembers = await prisma.projectMember.findMany({
        where: { projectId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Notify each mentioned user
      for (const mention of mentions) {
        const username = mention.substring(1); // Remove @
        const mentionedMember = projectMembers.find(
          (m) => m.user.name.toLowerCase() === username.toLowerCase()
        );

        if (mentionedMember && mentionedMember.userId !== userId) {
          await notifyMention(
            mentionedMember.userId,
            "PROJECT",
            projectId,
            project.name,
            content.substring(0, 100),
            userId,
            currentUser?.name || "Unknown"
          );
        }
      }
    } catch (error) {
      console.error("Failed to create mention notifications:", error);
    }
  }
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
  userId: string,
  role: ProjectMemberRole,
  updatedById: string
): Promise<any> => {
  // Check if project member exists
  const projectMember = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    include: { user: true },
  });

  if (!projectMember) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project member not found");
  }

  // Update role
  return await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        permissions: true,
      },
    });

    // Create activity log
    await tx.projectActivity.create({
      data: {
        type: "MEMBER_UPDATED",
        description: `changed ${projectMember.user.name}'s role from ${projectMember.role} to ${role}`,
        projectId,
        userId: updatedById,
        metadata: {
          updatedUserId: userId,
          updatedUserName: projectMember.user.name,
          oldRole: projectMember.role,
          newRole: role,
        },
      },
    });

    return member;
  });
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
