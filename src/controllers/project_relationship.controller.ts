import { Request, Response, NextFunction } from "express";
import {
  createProject,
  getProjectById,
  addRelatedProjects,
  removeRelatedProject,
  getRelatedProjects,
} from "../services/project.service";
import { ApiError, HttpStatus } from "../utils/error.utils";
import { Role } from "@prisma/client";

/**
 * POST /api/projects/:projectId/related
 * Add related projects to an existing project
 */
export const addRelatedProjectsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.params;
    const { relatedProjectIds } = req.body;
    const userId = req.user?.userId;

    if (!relatedProjectIds || !Array.isArray(relatedProjectIds)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "relatedProjectIds must be an array"
      );
    }

    if (relatedProjectIds.length === 0) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "relatedProjectIds cannot be empty"
      );
    }

    const relationships = await addRelatedProjects(
      projectId,
      relatedProjectIds,
      userId
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Related projects added successfully",
      data: relationships,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:projectId/related/:relatedProjectId
 * Remove a related project relationship
 */
export const removeRelatedProjectController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId, relatedProjectId } = req.params;
    const userId = req.user?.userId;

    await removeRelatedProject(projectId, relatedProjectId, userId);

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Related project removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:projectId/related
 * Get all related projects for a specific project
 */
export const getRelatedProjectsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.params;

    const relatedProjects = await getRelatedProjects(projectId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: relatedProjects,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects
 * Create a new project (updated to handle related projects)
 */
export const createProjectController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const {
      name,
      description,
      startDate,
      endDate,
      status,
      portfolioId,
      relatedProjectIds,
    } = req.body;

    // Validation
    if (!name || !startDate || !endDate || !portfolioId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "name, startDate, endDate, and portfolioId are required"
      );
    }

    const project = await createProject(
      {
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status,
        portfolioId,
        relatedProjectIds,
      },
      userId
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id
 * Get project by ID (already includes related projects)
 */
export const getProjectByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const project = await getProjectById(id);

    res.status(HttpStatus.OK).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};
