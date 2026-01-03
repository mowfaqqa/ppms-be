import { PrismaClient, Portfolio } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { programManagerHasPortfolioAccess } from "../utils/check-access.util";
import { Role } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Create portfolio
 */
export const createPortfolio = async (data: {
  name: string;
  yearId: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}): Promise<Portfolio> => {
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id: data.yearId },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  // Check if portfolio with same name already exists in this year
  const existingPortfolio = await prisma.portfolio.findFirst({
    where: {
      name: data.name,
      yearId: data.yearId,
    },
  });

  if (existingPortfolio) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Portfolio with name '${data.name}' already exists in year ${year.year}`
    );
  }

  return prisma.portfolio.create({
    data: {
      name: data.name,
      yearId: data.yearId,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status || "PLANNING",
    },
    include: {
      year: true,
    },
  });
};

/**
 * Get all portfolios with optional filters
 */
export const getAllPortfolios = async (
  userId: string, 
  role?: Role,
  filters?: {
    yearId?: string;
    status?: string;
    search?: string;
}) => {
  const where: any = {};

  if (role === "PROGRAM_MANAGER") {
    const portfolios = await prisma.portfolio.findMany({
      where: {
        programManagers: { some: { id: userId } },
      },
      select: { id: true },
    });

    if (!portfolios.length) {
      return []; 
    }

    where.id = { in: portfolios.map((p) => p.id) };
  }

  if (filters?.yearId) {
    where.yearId = filters.yearId;
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

  return prisma.portfolio.findMany({
    where,
    include: {
      year: true,
      _count: {
        select: {
          programs: true,
          projects: true, // Standalone projects
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Get portfolio by ID
 */
export const getPortfolioById = async (
  id: string,
  role: Role,
  userId: string
) => {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      programManagers: {
        select: { id: true}
      },
      year: true,
      programs: {
        include: {
          _count: {
            select: {
              projects: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      projects: {
        // Standalone projects (programId is null)
        where: {
          programId: null,
        },
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
      },
      _count: {
        select: {
          programs: true,
          projects: true,
        },
      },
    },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  if (role === "PROGRAM_MANAGER") {
    const hasAccess = portfolio.programManagers.some((m) => m.id === userId);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You don't have access to this portfolio");
    }
  }

  // Optionally remove programManagers from payload
  delete portfolio.programManagers;

  return portfolio;
};

/**
 * Update portfolio
 */
export const updatePortfolio = async (
  id: string,
  data: {
    name?: string;
    yearId?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  },
  role?: Role,
  userId?: string,
): Promise<Portfolio> => {

  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, id);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }
  
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      year: true,
    },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // If updating year, check if it exists
  if (data.yearId && data.yearId !== portfolio.yearId) {
    const year = await prisma.year.findUnique({
      where: { id: data.yearId },
    });

    if (!year) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Target year not found");
    }
  }

  // If updating name or year, check if another portfolio with same name exists in target year
  if (data.name || data.yearId) {
    const targetYearId = data.yearId || portfolio.yearId;
    const targetName = data.name || portfolio.name;

    const existingPortfolio = await prisma.portfolio.findFirst({
      where: {
        name: targetName,
        yearId: targetYearId,
        id: { not: id },
      },
    });

    if (existingPortfolio) {
      const year = await prisma.year.findUnique({
        where: { id: targetYearId },
      });
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Portfolio with name '${targetName}' already exists in year ${year?.year}`
      );
    }
  }

  return prisma.portfolio.update({
    where: { id },
    data: {
      name: data.name,
      yearId: data.yearId,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
    },
    include: {
      year: true,
    },
  });
};

/**
 * Delete portfolio
 * Note: This will cascade delete all programs, projects, and tasks under this portfolio
 */
export const deletePortfolio = async (
  id: string,
  role?: Role,
  userId?: string
): Promise<void> => {
  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, id);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }

  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          programs: true,
          projects: true,
        },
      },
    },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Warn if portfolio has programs or projects
  if (portfolio._count.programs > 0 || portfolio._count.projects > 0) {
    console.warn(
      `Deleting portfolio "${portfolio.name}" with ${portfolio._count.programs} programs and ${portfolio._count.projects} standalone projects`
    );
  }

  await prisma.portfolio.delete({
    where: { id },
  });
};

/**
 * Get portfolio stats
 */
export const getPortfolioStats = async (
  id: string,
  role?: Role,
  userId?: string
) => {
  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, id);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }

  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Get program counts
  const programsCount = await prisma.program.count({
    where: { portfolioId: id },
  });

  // Get program status breakdown
  const programs = await prisma.program.findMany({
    where: { portfolioId: id },
    select: {
      status: true,
    },
  });

  const programsByStatus = {
    PLANNING: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  programs.forEach((program) => {
    programsByStatus[program.status]++;
  });

  // Get all projects (both standalone and under programs)
  const projects = await prisma.project.findMany({
    where: {
      portfolioId: id,
    },
    select: {
      id: true,
      status: true,
      programId: true,
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

  const standaloneProjectsCount = projects.filter((p) => !p.programId).length;
  const programProjectsCount = projects.filter((p) => p.programId).length;

  projects.forEach((project) => {
    projectsByStatus[project.status]++;
  });

  // Get total task count and status breakdown
  const tasks = await prisma.task.findMany({
    where: {
      project: {
        portfolioId: id,
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

  return {
    programsCount,
    programsByStatus,
    projectCount: projects.length,
    standaloneProjectsCount,
    programProjectsCount,
    projects: projectsByStatus,
    tasks: tasksByStatus,
  };
};

/**
 * Get all portfolio projects (standalone only)
 */
export const getAllPortfolioProjects = async (
  portfolioId: string,
  role?: Role,
  userId?: string
) => {
  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, portfolioId);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }

  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Return only standalone projects (programId is null)
  return prisma.project.findMany({
    where: {
      portfolioId,
      programId: null,
    },
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
 * Get all projects under portfolio (including those in programs)
 */
export const getAllPortfolioProjectsIncludingPrograms = async (
  portfolioId: string,
  role?: Role,
  userId?: string
) => {
  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, portfolioId);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }

  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Return all projects under this portfolio
  return prisma.project.findMany({
    where: {
      portfolioId,
    },
    include: {
      program: {
        select: {
          id: true,
          name: true,
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
      createdAt: "desc",
    },
  });
};

/**
 * Get all programs for a portfolio
 */
export const getPortfolioPrograms = async (
  portfolioId: string,
  role?: Role,
  userId?: string
) => {
  if (role === "PROGRAM_MANAGER") {
    const hasAccess = await programManagerHasPortfolioAccess(userId!, portfolioId);
    if (!hasAccess) {
      throw new ApiError(HttpStatus.FORBIDDEN, "You do not have access to this portfolio");
    }
  }
  
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  return prisma.program.findMany({
    where: { portfolioId },
    include: {
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
