import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware"; // Your auth middleware
import { checkProjectPermission } from "../middleware/permission.middleware"; // Your permission middleware
import {
  addRelatedProjectsController,
  createProjectController,
  getProjectByIdController,
  getRelatedProjectsController,
  removeRelatedProjectController,
} from "../controllers/project_relationship.controller";

const router = Router();

// ==================== PROJECT ROUTES ====================

/**
 * POST /api/projects
 * Create a new project (with optional related projects)
 */
router.post(
  "/",
  authenticate,
  checkProjectPermission("project.create"), // Optional: Add permission check
  createProjectController
);

/**
 * GET /api/projects/:id
 * Get project by ID (includes related projects)
 */
router.get(
  "/:id",
  authenticate,
  checkProjectPermission("project.view"),
  getProjectByIdController
);

// ==================== PROJECT RELATIONSHIP ROUTES ====================

/**
 * POST /api/projects/:projectId/related
 * Add related projects to an existing project
 * Body: { relatedProjectIds: string[] }
 */
router.post(
  "/:projectId/related",
  authenticate,
  checkProjectPermission("project.edit"),
  addRelatedProjectsController
);

/**
 * DELETE /api/projects/:projectId/related/:relatedProjectId
 * Remove a related project relationship
 */
router.delete(
  "/:projectId/related/:relatedProjectId",
  authenticate,
  checkProjectPermission("project.edit"),
  removeRelatedProjectController
);

/**
 * GET /api/projects/:projectId/related
 * Get all related projects for a specific project
 */
router.get(
  "/:projectId/related",
  authenticate,
  checkProjectPermission("project.view"),
  getRelatedProjectsController
);

export default router;
