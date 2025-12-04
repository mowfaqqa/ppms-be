import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { register, login } from "../services/auth.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  "/register",
  [
    check("name", "Name is required").notEmpty(),
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password must be at least 6 characters").isLength({
      min: 6,
    }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { name, email, password } = req.body;
    console.log(`Register attempt for: ${email}`);

    const result = await register(email, password, name);

    const userWithPermissions = {
      ...result.user,
      permissions: getPermissionsForRole(result.user.role),
    };

    res.status(201).json({
      success: true,
      data: {
        user: userWithPermissions,
        token: result.token,
      },
    });
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
  "/login",
  [
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password is required").exists(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { email, password } = req.body;

    try {
      const result = await login(email, password);

      const userWithPermissions = {
        ...result.user,
        permissions: getPermissionsForRole(result.user.role),
      };

      console.log("Login successful for:", email);

      return res.status(200).json({
        success: true,
        data: {
          user: userWithPermissions,
          token: result.token,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(401).json({
        success: false,
        message: error.message || "Invalid credentials",
      });
    }
  })
);

/**
 * Helper function to get permissions based on role
 */
function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case "ADMIN":
      return [
        "create",
        "read",
        "update",
        "delete",
        "manage_users",
        "view_reports",
        "manage_portfolios",
        "manage_projects",
        "view_audit_trail",
      ];
    case "PROJECT_MANAGER":
      return [
        "create",
        "read",
        "update",
        "view_reports",
        "manage_projects",
        "manage_team",
      ];
    case "TEAM_MEMBER":
      return ["read", "update"];
    default:
      return ["read"];
  }
}

export default router;
