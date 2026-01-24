import { PrismaClient, Program, ProgramStatus, Role } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { getNestedPortfolioScope } from "../utils/check-access.util";
import { getPortfolioScope } from "../utils/check-access.util";

const prisma = new PrismaClient();

/**
 * Create a new program
 */
export const createProgram = async (
  data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    status?: ProgramStatus;
    portfolioId: string;
  },
  userId: string
): Promise<Program> => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: data.portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Check if program with same name already exists in this portfolio
  const existingProgram = await prisma.program.findFirst({
    where: {
      name: data.name,
      portfolioId: data.portfolioId,
    },
  });

  if (existingProgram) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Program with name '${data.name}' already exists in this portfolio`
    );
  }

  // Validate dates
  if (new Date(data.startDate) > new Date(data.endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Create program
  const program = await prisma.program.create({
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status || ProgramStatus.PLANNING,
      portfolioId: data.portfolioId,
    },
    include: {
      portfolio: true,
    },
  });

  // Log activity
  await prisma.programActivity.create({
    data: {
      type: "CREATED",
      description: `Program "${program.name}" created`,
      programId: program.id,
      userId: userId,
      metadata: {
        status: program.status,
      },
    },
  });

  return program;
};

/**
 * Get all programs with optional filters
 */
export const getAllPrograms = async (filters?: {
  portfolioId?: string;
  status?: ProgramStatus;
  search?: string;
}, user?: {
  role: Role;
  userId: string;
}) => {
  const nestedPortfolioScope = getNestedPortfolioScope(user);
  const where: any = { ...nestedPortfolioScope };

  if (filters?.portfolioId) {
    where.AND = [
      ...(where.AND || []),
      { portfolioId: filters.portfolioId },
    ];
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

  return prisma.program.findMany({
    where,
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
      _count: {
        select: {
          projects: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Get program by ID
 */
export const getProgramById = async (id: string, user?: {
  userRole: Role,
  userId: string
}) => {
  let whereClause: any = { id };

  // Role-based filtering for program managers
  if (user.userRole === "PROGRAM_MANAGER") {
    const portfolioScope = getPortfolioScope({
      role: user.userRole, userId: user.userId
    });
    whereClause.portfolio = portfolioScope;
  }

  const program = await prisma.program.findUnique({
    where: whereClause,
    include: {
      portfolio: {
        select: {
          id: true,
          name: true,
          year: {
            select: {
              id: true,
              year: true,
            },
          },
        },
      },
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          _count: {
            select: {
              tasks: true,
              members: true,
            },
          },
        },
      },
      _count: {
        select: {
          projects: true,
          activities: true,
        },
      },
    },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  return program;
};

/**
 * Update program
 */
export const updateProgram = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    status?: ProgramStatus;
    portfolioId?: string; // Admin can move program to different portfolio
  },
  userId: string,
  userRole: Role
): Promise<Program> => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      portfolio: true,
    },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  // Only ADMIN can change portfolio
  if (data.portfolioId && data.portfolioId !== program.portfolioId) {
    if (userRole !== Role.ADMIN) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "Only administrators can move programs between portfolios"
      );
    }

    // Check if target portfolio exists
    const targetPortfolio = await prisma.portfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!targetPortfolio) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Target portfolio not found");
    }

    // Check if program name already exists in target portfolio
    const existingProgram = await prisma.program.findFirst({
      where: {
        name: data.name || program.name,
        portfolioId: data.portfolioId,
        id: { not: id },
      },
    });

    if (existingProgram) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Program with name '${
          data.name || program.name
        }' already exists in target portfolio`
      );
    }
  }

  // If updating name, check if new name already exists in the same portfolio
  if (data.name && data.name !== program.name) {
    const existingProgram = await prisma.program.findFirst({
      where: {
        name: data.name,
        portfolioId: data.portfolioId || program.portfolioId,
        id: { not: id },
      },
    });

    if (existingProgram) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Program with name '${data.name}' already exists in this portfolio`
      );
    }
  }

  // Validate dates if both are provided
  const startDate = data.startDate || program.startDate;
  const endDate = data.endDate || program.endDate;

  if (new Date(startDate) > new Date(endDate)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Start date must be before end date"
    );
  }

  // Build changes object for activity log
  const changes: any = {};
  if (data.name && data.name !== program.name) changes.name = data.name;
  if (data.status && data.status !== program.status)
    changes.status = data.status;
  if (data.portfolioId && data.portfolioId !== program.portfolioId)
    changes.portfolioId = data.portfolioId;

  // Update program
  const updatedProgram = await prisma.program.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      portfolioId: data.portfolioId,
    },
    include: {
      portfolio: {
        include: {
          year: true,
        },
      },
    },
  });

  // Log activity
  await prisma.programActivity.create({
    data: {
      type: "UPDATED",
      description: `Program "${updatedProgram.name}" updated`,
      programId: updatedProgram.id,
      userId: userId,
      metadata: changes,
    },
  });

  // If portfolio changed, update all projects under this program
  if (data.portfolioId && data.portfolioId !== program.portfolioId) {
    await prisma.project.updateMany({
      where: { programId: id },
      data: { portfolioId: data.portfolioId },
    });
  }

  return updatedProgram;
};

/**
 * Delete program
 * Note: This will cascade delete all projects and tasks under this program
 */
export const deleteProgram = async (
  id: string,
  userId: string
): Promise<void> => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          projects: true,
        },
      },
    },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  // Warn if program has projects
  if (program._count.projects > 0) {
    console.warn(
      `Deleting program "${program.name}" with ${program._count.projects} projects`
    );
  }

  // Delete program (cascade will handle projects and tasks)
  await prisma.program.delete({
    where: { id },
  });
};

/**
 * Get program statistics
 */
export const getProgramStats = async (id: string) => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  // Get projects count by status
  const projects = await prisma.project.findMany({
    where: { programId: id },
    select: {
      id: true,
      status: true,
    },
  });

  const projectsByStatus = {
    PLANNING: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    total: projects.length,
  };

  projects.forEach((project) => {
    projectsByStatus[project.status]++;
  });

  // Get total task count and status breakdown
  const tasks = await prisma.task.findMany({
    where: {
      project: {
        programId: id,
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  const tasksByStatus = {
    TODO: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    COMPLETED: 0,
    total: tasks.length,
  };

  tasks.forEach((task) => {
    tasksByStatus[task.status]++;
  });

  // Calculate completion rate
  const completionRate =
    tasks.length > 0
      ? Math.round((tasksByStatus.COMPLETED / tasks.length) * 100)
      : 0;

  return {
    projectCount: projects.length,
    projects: projectsByStatus,
    tasks: tasksByStatus,
    completionRate,
  };
};

/**
 * Get all projects for a program
 */
export const getProgramProjects = async (programId: string) => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id: programId },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  return prisma.project.findMany({
    where: { programId },
    include: {
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
 * Get program activity log
 */
export const getProgramActivity = async (
  programId: string,
  limit: number = 50
) => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id: programId },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  return prisma.programActivity.findMany({
    where: { programId },
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
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
};

/**
 * Move program to different portfolio (Admin only)
 */
export const moveProgramToPortfolio = async (
  programId: string,
  targetPortfolioId: string,
  userId: string
): Promise<Program> => {
  // Check if program exists
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      portfolio: true,
    },
  });

  if (!program) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Program not found");
  }

  // Check if target portfolio exists
  const targetPortfolio = await prisma.portfolio.findUnique({
    where: { id: targetPortfolioId },
  });

  if (!targetPortfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Target portfolio not found");
  }

  // Check if program name already exists in target portfolio
  const existingProgram = await prisma.program.findFirst({
    where: {
      name: program.name,
      portfolioId: targetPortfolioId,
      id: { not: programId },
    },
  });

  if (existingProgram) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Program with name '${program.name}' already exists in target portfolio`
    );
  }

  // Move program and all its projects to new portfolio
  const [updatedProgram] = await prisma.$transaction([
    prisma.program.update({
      where: { id: programId },
      data: { portfolioId: targetPortfolioId },
      include: {
        portfolio: {
          include: {
            year: true,
          },
        },
      },
    }),
    prisma.project.updateMany({
      where: { programId: programId },
      data: { portfolioId: targetPortfolioId },
    }),
  ]);

  // Log activity
  await prisma.programActivity.create({
    data: {
      type: "UPDATED",
      description: `Program "${program.name}" moved to portfolio "${targetPortfolio.name}"`,
      programId: programId,
      userId: userId,
      metadata: {
        fromPortfolio: program.portfolio.name,
        toPortfolio: targetPortfolio.name,
      },
    },
  });

  return updatedProgram;
};
