import { PrismaClient, Year } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

/**
 * Create a new year
 */
export const createYear = async (data: {
  year: number;
  description?: string;
}): Promise<Year> => {
  // Check if year already exists
  const existingYear = await prisma.year.findUnique({
    where: { year: data.year },
  });

  if (existingYear) {
    throw new ApiError(HttpStatus.CONFLICT, `Year ${data.year} already exists`);
  }

  return prisma.year.create({
    data: {
      year: data.year,
      description: data.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
};

/**
 * Get all years with portfolio counts
 */
export const getAllYears = async (): Promise<
  (Year & { _count: { portfolios: number } })[]
> => {
  return prisma.year.findMany({
    include: {
      _count: {
        select: {
          portfolios: true,
        },
      },
    },
    orderBy: {
      year: "desc", // Most recent year first
    },
  });
};

/**
 * Get year by ID with portfolios
 */
export const getYearById = async (id: string) => {
  const year = await prisma.year.findUnique({
    where: { id },
    include: {
      portfolios: {
        include: {
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
      },
    },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  return year;
};

/**
 * Get year by year number
 */
export const getYearByNumber = async (yearNumber: number) => {
  const year = await prisma.year.findUnique({
    where: { year: yearNumber },
    include: {
      portfolios: {
        include: {
          _count: {
            select: {
              programs: true,
              projects: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, `Year ${yearNumber} not found`);
  }

  return year;
};

/**
 * Update year
 */
export const updateYear = async (
  id: string,
  data: {
    year?: number;
    description?: string;
  }
): Promise<Year> => {
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  // If updating year number, check if new year already exists
  if (data.year && data.year !== year.year) {
    const existingYear = await prisma.year.findUnique({
      where: { year: data.year },
    });

    if (existingYear) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Year ${data.year} already exists`
      );
    }
  }

  return prisma.year.update({
    where: { id },
    data,
  });
};

/**
 * Delete year
 * Note: This will cascade delete all portfolios, programs, projects, and tasks under this year
 */
export const deleteYear = async (id: string): Promise<void> => {
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          portfolios: true,
        },
      },
    },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  // Warn if year has portfolios (this is for business logic, deletion is still allowed)
  if (year._count.portfolios > 0) {
    // You might want to add a force flag or additional confirmation here
    console.warn(
      `Deleting year ${year.year} with ${year._count.portfolios} portfolios`
    );
  }

  await prisma.year.delete({
    where: { id },
  });
};

/**
 * Get year statistics
 */
export const getYearStats = async (id: string) => {
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  // Get portfolios count
  const portfoliosCount = await prisma.portfolio.count({
    where: { yearId: id },
  });

  // Get programs count across all portfolios in this year
  const programsCount = await prisma.program.count({
    where: {
      portfolio: {
        yearId: id,
      },
    },
  });

  // Get projects count across all portfolios in this year
  const projectsCount = await prisma.project.count({
    where: {
      portfolio: {
        yearId: id,
      },
    },
  });

  // Get tasks count across all projects in this year
  const tasksCount = await prisma.task.count({
    where: {
      project: {
        portfolio: {
          yearId: id,
        },
      },
    },
  });

  // Get project status breakdown
  const projects = await prisma.project.findMany({
    where: {
      portfolio: {
        yearId: id,
      },
    },
    select: {
      status: true,
    },
  });

  const projectsByStatus = {
    PLANNING: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  projects.forEach((project) => {
    projectsByStatus[project.status]++;
  });

  // Get task status breakdown
  const tasks = await prisma.task.findMany({
    where: {
      project: {
        portfolio: {
          yearId: id,
        },
      },
    },
    select: {
      status: true,
    },
  });

  const tasksByStatus = {
    TODO: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    COMPLETED: 0,
  };

  tasks.forEach((task) => {
    tasksByStatus[task.status]++;
  });

  return {
    portfoliosCount,
    programsCount,
    projectsCount,
    tasksCount,
    projectsByStatus,
    tasksByStatus,
  };
};

/**
 * Get all portfolios for a year
 */
export const getYearPortfolios = async (yearId: string) => {
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id: yearId },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  return prisma.portfolio.findMany({
    where: { yearId },
    include: {
      _count: {
        select: {
          programs: true,
          projects: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};
