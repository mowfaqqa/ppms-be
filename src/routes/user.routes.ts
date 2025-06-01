import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserWorkload,
} from "../services/user.service";

const router = Router();

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private/Admin
 */
router.get(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const users = await getAllUsers();

    res.status(200).json({
      success: true,
      data: users,
    });
  })
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // Only admins can view other users' profiles
    if (id !== req.user?.userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this user",
      });
    }

    const user = await getUserById(id);

    res.status(200).json({
      success: true,
      data: user,
    });
  })
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  [
    check("name", "Name is required").optional().notEmpty(),
    check("email", "Please include a valid email").optional().isEmail(),
    check("password", "Password must be at least 6 characters")
      .optional()
      .isLength({ min: 6 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    // Only admins can update other users' profiles
    if (id !== req.user?.userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this user",
      });
    }

    // Only admins can update roles
    if (role && req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update user role",
      });
    }

    const user = await updateUser(id, {
      name,
      email,
      password,
      role,
    });

    res.status(200).json({
      success: true,
      data: user,
    });
  })
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteUser(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  })
);

/**
 * @route   GET /api/users/:id/workload
 * @desc    Get user workload
 * @access  Private
 */
router.get(
  "/:id/workload",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // Only admins or the user themselves can view their workload
    if (id !== req.user?.userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this user's workload",
      });
    }

    const workload = await getUserWorkload(id);

    res.status(200).json({
      success: true,
      data: workload,
    });
  })
);

export default router;
