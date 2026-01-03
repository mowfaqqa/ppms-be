import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { programManagerHasPortfolioAccess } from "../utils/check-access.util";
const prisma = new PrismaClient();

// Check project permission middleware
export const checkProjectPermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ApiError(HttpStatus.UNAUTHORIZED, "User not authenticated");
      }

      // Admin has all permissions
      if (req.user.role === "ADMIN") {
        return next();
      }

      const projectId = req.params?.projectId || req.body.projectId;

      if (!projectId) {
        throw new ApiError(HttpStatus.BAD_REQUEST, "Project ID is required");
      }

      // check if user(proram manager) is assigned a portfolio 
      if (req.user.role === "PROGRAM_MANAGER") {
        const projectPortfolioId = await getProjectPortfolioId(projectId);

        const hasAccess = await programManagerHasPortfolioAccess(
          req.user.userId,
          projectPortfolioId
        );

        if (!hasAccess) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You don't have access to this portfolio"
          );
        }
     
        return next();
      }

      // Check if user is member of the project with required permission
      const projectMember = await prisma.projectMember.findFirst({
        where: {
          userId: req.user.userId,
          projectId: projectId,
          permissions: {
            some: {
              name: permission,
            },
          },
        },
      });

      if (!projectMember) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          `You don't have ${permission} permission for this project`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Check task permission middleware
export const checkTaskPermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ApiError(HttpStatus.UNAUTHORIZED, "User not authenticated");
      }

      // Admin has all permissions
      if (req.user.role === "ADMIN") {
        return next();
      }

      const taskId = req.params.taskId || req.body.taskId;

      if (!taskId) {
        throw new ApiError(HttpStatus.BAD_REQUEST, "Task ID is required");
      }

      // Get the task and its project
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { projectId: true },
      });

      if (!task) {
        throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
      }

      // Check if user is member of the project with required permission
      const projectMember = await prisma.projectMember.findFirst({
        where: {
          userId: req.user.userId,
          projectId: task.projectId,
          permissions: {
            some: {
              name: permission,
            },
          },
        },
      });

      if (!projectMember) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          `You don't have ${permission} permission for this task's project`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Check user assignment limit
export const checkAssignmentLimit = async (
  req: Request,
  res: any,
  next: NextFunction
) => {
  try {
    const userId = req.body.userId;
    const projectId = req.body.projectId;
    const taskId = req.body.taskId;

    if (!userId) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "User ID is required");
    }

    // Check if adding to a project
    if (projectId) {
      const projectCount = await prisma.projectMember.count({
        where: { userId },
      });

      if (projectCount >= 3) {
        return res.status(HttpStatus.OK).json({
          success: true,
          warning: "User is already assigned to 3 or more projects",
          data: { projectCount },
        });
      }
    }

    // Check if adding to a task
    if (taskId) {
      const taskCount = await prisma.taskAssignment.count({
        where: { userId },
      });

      if (taskCount >= 3) {
        return res.status(HttpStatus.OK).json({
          success: true,
          warning: "User is already assigned to 3 or more tasks",
          data: { taskCount },
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// check if portfolio assigned to program manager exists
const getProjectPortfolioId = async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { portfolioId: true },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  return project.portfolioId;
};
