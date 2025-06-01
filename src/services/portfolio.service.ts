import { PrismaClient, Portfolio } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Create portfolio
export const createPortfolio = async (data: {
  name: string;
  year?: number;
  description?: string;
  budget?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}): Promise<Portfolio> => {
  // Extract year from startDate if not provided
  const year = new Date().getFullYear();
  
  // Check if portfolio with same name and year already exists
  const existingPortfolio = await prisma.portfolio.findFirst({
    where: {
      name: data.name,
      year: year,
    },
  });

  if (existingPortfolio) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Portfolio with name '${data.name}' for year ${year} already exists`
    );
  }

  return prisma.portfolio.create({
    data: {
      name: data.name,
      year: year,
      description: data.description,
      budget: data.budget,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status || "PLANNING", // Default status if not provided
      // Add other fields to your schema if needed
    },
  });
};

// Get all portfolios
export const getAllPortfolios = async (): Promise<Portfolio[]> => {
  return prisma.portfolio.findMany({
    orderBy: {
      year: "desc",
    },
  });
};

// Get portfolio by ID
export const getPortfolioById = async (
  id: string
): Promise<Portfolio & { pillars: any[] }> => {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      pillars: {
        include: {
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
                },
              },
            },
          },
          _count: {
            select: {
              projects: true,
            },
          },
        },
      },
    },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  return portfolio;
};

// Update portfolio
export const updatePortfolio = async (
  id: string,
  data: {
    name?: string;
    year?: number;
    description?: string;
  }
): Promise<Portfolio> => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // If updating name and year, check if another portfolio with same name and year exists
  if (
    (data.name || data.year) &&
    (data.name !== portfolio.name || data.year !== portfolio.year)
  ) {
    const existingPortfolio = await prisma.portfolio.findFirst({
      where: {
        name: data.name || portfolio.name,
        year: data.year || portfolio.year,
        id: { not: id },
      },
    });

    if (existingPortfolio) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Portfolio with name '${data.name || portfolio.name}' for year ${
          data.year || portfolio.year
        } already exists`
      );
    }
  }

  return prisma.portfolio.update({
    where: { id },
    data,
  });
};

// Delete portfolio
export const deletePortfolio = async (id: string): Promise<void> => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      pillars: {
        include: {
          projects: true,
        },
      },
    },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Delete portfolio (cascade will delete pillars, projects, tasks, etc.)
  await prisma.portfolio.delete({
    where: { id },
  });
};

// Get portfolio stats
export const getPortfolioStats = async (id: string) => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Get pillar count
  const pillarCount = await prisma.pillar.count({
    where: { portfolioId: id },
  });

  // Get project counts by status
  const projects = await prisma.project.findMany({
    where: {
      pillar: {
        portfolioId: id,
      },
    },
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
        pillar: {
          portfolioId: id,
        },
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
    pillarCount,
    projects: projectsByStatus,
    tasks: tasksByStatus,
  };
};
