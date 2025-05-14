import { PrismaClient, Pillar } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Create pillar
export const createPillar = async (data: {
  name: string;
  description?: string;
  portfolioId: string;
}): Promise<Pillar> => {
  // Check if portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: data.portfolioId },
  });

  if (!portfolio) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Portfolio not found");
  }

  // Check if pillar with same name already exists in the portfolio
  const existingPillar = await prisma.pillar.findFirst({
    where: {
      name: data.name,
      portfolioId: data.portfolioId,
    },
  });

  if (existingPillar) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Pillar with name '${data.name}' already exists in this portfolio`
    );
  }

  return prisma.pillar.create({
    data,
  });
};

// Get all pillars (optionally filtered by portfolio)
export const getAllPillars = async (
  portfolioId?: string
): Promise<Pillar[]> => {
  const where = portfolioId ? { portfolioId } : {};

  return prisma.pillar.findMany({
    where,
    include: {
      portfolio: {
        select: {
          name: true,
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

// Get pillar by ID
export const getPillarById = async (
  id: string
): Promise<Pillar & { projects: any[] }> => {
  const pillar = await prisma.pillar.findUnique({
    where: { id },
    include: {
      portfolio: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
      projects: {
        include: {
          _count: {
            select: {
              tasks: true,
              members: true,
            },
          },
        },
      },
    },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  return pillar;
};

// Update pillar
export const updatePillar = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    portfolioId?: string;
  }
): Promise<Pillar> => {
  // Check if pillar exists
  const pillar = await prisma.pillar.findUnique({
    where: { id },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  // If updating portfolio, check if new portfolio exists
  if (data.portfolioId && data.portfolioId !== pillar.portfolioId) {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!portfolio) {
      throw new ApiError(HttpStatus.NOT_FOUND, "New portfolio not found");
    }
  }

  // If updating name, check if pillar with same name exists in portfolio
  if (data.name && data.name !== pillar.name) {
    const existingPillar = await prisma.pillar.findFirst({
      where: {
        name: data.name,
        portfolioId: data.portfolioId || pillar.portfolioId,
        id: { not: id },
      },
    });

    if (existingPillar) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Pillar with name '${data.name}' already exists in this portfolio`
      );
    }
  }

  return prisma.pillar.update({
    where: { id },
    data,
  });
};

// Delete pillar
export const deletePillar = async (id: string): Promise<void> => {
  // Check if pillar exists
  const pillar = await prisma.pillar.findUnique({
    where: { id },
    include: {
      projects: true,
    },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  // Delete pillar (cascade will delete projects, tasks, etc.)
  await prisma.pillar.delete({
    where: { id },
  });
};

// Get pillar stats
export const getPillarStats = async (id: string) => {
  // Check if pillar exists
  const pillar = await prisma.pillar.findUnique({
    where: { id },
  });

  if (!pillar) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Pillar not found");
  }

  // Get project counts by status
  const projects = await prisma.project.findMany({
    where: { pillarId: id },
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
        pillarId: id,
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
    projectCount: projects.length,
    projects: projectsByStatus,
    tasks: tasksByStatus,
  };
};
