import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createYear,
  getAllYears,
  getYearById,
  getYearByNumber,
  updateYear,
  deleteYear,
  getYearStats,
  getYearPortfolios,
} from "../services/year.service";
import { auditLog } from "../middleware/audit.middleware";
import { AuditAction, EntityType } from "@prisma/client";

const router = Router();

/**
 * @route   POST /api/years
 * @desc    Create a new year
 * @access  Private/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("year", "Year is required and must be a valid number")
      .notEmpty()
      .isInt({ min: 2000, max: 2100 }),
    validate,
  ],
  auditLog({
    action: AuditAction.CREATED,
    entityType: EntityType.YEAR,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { year, description } = req.body;

    const yearEntity = await createYear({
      year: parseInt(year),
      description,
    });

    res.status(201).json({
      success: true,
      data: yearEntity,
      message: `Year ${year} created successfully`,
    });
  })
);

/**
 * @route   GET /api/years
 * @desc    Get all years
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const years = await getAllYears();

    res.status(200).json({
      success: true,
      data: years,
    });
  })
);

/**
 * @route   GET /api/years/:id
 * @desc    Get year by ID with portfolios
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const year = await getYearById(id);

    res.status(200).json({
      success: true,
      data: year,
    });
  })
);

/**
 * @route   GET /api/years/number/:yearNumber
 * @desc    Get year by year number (e.g., 2025)
 * @access  Private
 */
router.get(
  "/number/:yearNumber",
  authenticate,
  [
    check("yearNumber", "Year number must be a valid integer")
      .isInt({ min: 2000, max: 2100 })
      .toInt(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { yearNumber } = req.params;

    const year = await getYearByNumber(parseInt(yearNumber));

    res.status(200).json({
      success: true,
      data: year,
    });
  })
);

/**
 * @route   PUT /api/years/:id
 * @desc    Update year
 * @access  Private/Admin
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("year", "Year must be a valid number if provided")
      .optional()
      .isInt({ min: 2000, max: 2100 }),
    validate,
  ],
  auditLog({
    action: AuditAction.UPDATED,
    entityType: EntityType.YEAR,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { year, description } = req.body;

    const yearEntity = await updateYear(id, {
      year: year ? parseInt(year) : undefined,
      description,
    });

    res.status(200).json({
      success: true,
      data: yearEntity,
      message: "Year updated successfully",
    });
  })
);

/**
 * @route   DELETE /api/years/:id
 * @desc    Delete year (cascades to all portfolios, programs, projects, tasks)
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  auditLog({
    action: AuditAction.DELETED,
    entityType: EntityType.YEAR,
  }),
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteYear(id);

    res.status(200).json({
      success: true,
      message: "Year deleted successfully",
    });
  })
);

/**
 * @route   GET /api/years/:id/stats
 * @desc    Get year statistics (portfolios, programs, projects, tasks counts)
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stats = await getYearStats(id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/years/:id/portfolios
 * @desc    Get all portfolios for a year
 * @access  Private
 */
router.get(
  "/:id/portfolios",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const portfolios = await getYearPortfolios(id);

    res.status(200).json({
      success: true,
      data: portfolios,
    });
  })
);

export default router;
