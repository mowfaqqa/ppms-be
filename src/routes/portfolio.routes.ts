import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  createPortfolio,
  getAllPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
  getPortfolioStats,
} from "../services/portfolio.service";

const router = Router();

/**
 * @route   POST /api/portfolios
 * @desc    Create a new portfolio
 * @access  Private/Admin
 */
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name is required").notEmpty(),
    validate,
  ],
  asyncHandler(async (req:any, res:any) => {
    const { name, description, budget, startDate, endDate, status } = req.body;

    const portfolio = await createPortfolio({
      name,
      description,
      budget,
      startDate,
      endDate,
      status
    });

    res.status(201).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   GET /api/portfolios
 * @desc    Get all portfolios
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req:any, res:any) => {
    const portfolios = await getAllPortfolios();

    res.status(200).json({
      success: true,
      data: portfolios,
    });
  })
);

/**
 * @route   GET /api/portfolios/:id
 * @desc    Get portfolio by ID
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req:any, res:any) => {
    const { id } = req.params;

    const portfolio = await getPortfolioById(id);

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   PUT /api/portfolios/:id
 * @desc    Update portfolio
 * @access  Private/Admin
 */
router.put(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  [
    check("name", "Name must not be empty if provided").optional().notEmpty(),
    check("year", "Year must be a number if provided").optional().isInt(),
    validate,
  ],
  asyncHandler(async (req:any, res:any) => {
    const { id } = req.params;
    const { name, year, description } = req.body;

    const portfolio = await updatePortfolio(id, {
      name,
      year,
      description,
    });

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  })
);

/**
 * @route   DELETE /api/portfolios/:id
 * @desc    Delete portfolio
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN"]),
  asyncHandler(async (req:any, res:any) => {
    const { id } = req.params;

    await deletePortfolio(id);

    res.status(200).json({
      success: true,
      message: "Portfolio deleted successfully",
    });
  })
);

/**
 * @route   GET /api/portfolios/:id/stats
 * @desc    Get portfolio statistics
 * @access  Private
 */
router.get(
  "/:id/stats",
  authenticate,
  asyncHandler(async (req:any, res:any) => {
    const { id } = req.params;

    const stats = await getPortfolioStats(id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

export default router;
