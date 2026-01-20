import { PrismaClient, Role, Year } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { getPortfolioScope } from "../utils/check-access.util";

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
export const getAllYears = async (user?: {
  role: Role,
  userId: string
}): Promise<
  (Year & { _count: { portfolios: number } })[]
> => {
  let where: any = {};

  if (user.role === "PROGRAM_MANAGER") {
    where = {
      portfolios: {
        some: {
          programManagers: {
            some: {
              id: user.userId,
            },
          },
        },
      },
    };
  }

  if (user.role === "PROJECT_MANAGER") {
    where = {
      portfolios: {
        some: {
          projects: {
            some: {
              members: {
                some: {
                  id: user.userId,
                },
              },
            },
          },
        },
      },
    };
  }
  return prisma.year.findMany({
    where,
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
export const getYearById = async (
  id: string,
  user?: {
    userRole: Role,
    userId: string
  }) => {
  let portfolioWhere: any = {};
  console.log('here i am');
  const nestedPortfolio = getPortfolioScope({ role: user.userRole, userId: user.userId});

  if (user.userRole === "PROGRAM_MANAGER") {
    portfolioWhere = { ...nestedPortfolio };  
  }
  
  const year = await prisma.year.findUnique({
    where: { id },
    include: {
      portfolios: {
        where: portfolioWhere,
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

  console.log(year)

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
export const getYearStats = async (
  id: string,
  user?: {
    userRole: Role,
    userId: string
  }
) => {
  let portfolioScope: any = {};

  const year = await prisma.year.findUnique({
    where: { id },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

  if (user.userRole === 'PROGRAM_MANAGER') {
    portfolioScope = getPortfolioScope({ role: user.userRole, userId: user.userId});
  }

  const portfoliosCount = await prisma.portfolio.count({
    where: { 
      yearId: id,
      ...portfolioScope
    },
  });

  const programsCount = await prisma.program.count({
    where: {
      portfolio: {
        yearId: id,
        ...portfolioScope
      },
    },
  });

  const projectsCount = await prisma.project.count({
    where: {
      portfolio: {
        yearId: id,
        ...portfolioScope
      },
    },
  });

  // Get tasks count across all projects in this year
  const tasksCount = await prisma.task.count({
    where: {
      project: {
        portfolio: {
          yearId: id,
          ...portfolioScope
        },
      },
    },
  });

  // Get project status breakdown
  const projects = await prisma.project.findMany({
    where: {
      portfolio: {
        yearId: id,
        ...portfolioScope
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
          ...portfolioScope
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
export const getYearPortfolios = async (
  yearId: string,
  user?: {
    userRole: Role,
    userId: string
  }
) => {
  let portfolioScope: any = {};
  // Check if year exists
  const year = await prisma.year.findUnique({
    where: { id: yearId },
  });

  if (!year) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Year not found");
  }

   if (user.userRole === 'PROGRAM_MANAGER') {
    portfolioScope = getPortfolioScope({ role: user.userRole, userId: user.userId});
  }

  return prisma.portfolio.findMany({
    where: { yearId, ...portfolioScope },
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
