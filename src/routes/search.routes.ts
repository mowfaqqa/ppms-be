import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { searchAll } from "../services/search.service";

const router = Router();

/**
 * @route   GET /api/search
 * @desc    Search projects and tasks with RBAC
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  [
    check("q", "Search query is required and must be at least 2 characters")
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .trim(),
    check("limit", "Limit must be between 1 and 20")
      .optional()
      .isInt({ min: 1, max: 20 })
      .toInt(),
    check("category", "Category must be 'all', 'projects', or 'tasks'")
      .optional()
      .isIn(['all', 'projects', 'tasks']),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { q: query, limit, category } = req.query;
    const user = {
      role: req.user!.role,
      userId: req.user!.userId,
    };

    const results = await searchAll(query, user, {
      limit: limit ? parseInt(limit) : 5,
      category: category || 'all',
    });

    res.status(200).json({
      success: true,
      data: results,
    });
  })
);

export default router;