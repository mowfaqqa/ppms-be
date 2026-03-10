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
 * @access  Admin, Program Manager, Project Manager, Team Member
 */
router.get(
  "/",
  authenticate,
  authorize(["ADMIN", "PROGRAM_MANAGER", "PROJECT_MANAGER", "TEAM_MEMBER"]),
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
 * @route   PUT /api/users/update/profile
 * @desc    Update user
 * @access  Public
 */
router.put(
  "/update/profile",
  authenticate,
  [
    check("name", "Name is required").optional().notEmpty(),
    check("email", "Please include a valid email").optional().isEmail(),
    check("currentPassword", "Current password is required when changing password")
      .if(check("newPassword").exists())
      .notEmpty(),
    check("newPassword", "New password must be at least 6 characters")
      .optional()
      .isLength({ min: 6 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { name, email, currentPassword, newPassword, role } = req.body;
    const { userId } = req.user;

    const user = await updateUser(userId, {
      name,
      email,
      currentPassword,
      newPassword,
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
