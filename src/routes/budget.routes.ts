import { Router } from "express";
import { check } from "express-validator";
import { asyncHandler } from "../utils/common.utils";
import { validate } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import {
  createBudget,
  getProjectBudget,
  updateBudget,
  addBudgetAllocation,
  updateBudgetAllocation,
  deleteBudgetAllocation,
  addExpense,
  updateExpense,
  deleteExpense,
  getBudgetSummary,
} from "../services/budget.service";

const router = Router();

/**
 * @route   POST /api/budgets
 * @desc    Create a budget for a project
 * @access  Private
 */
router.post(
  "/",
  authenticate,
  [
    check("projectId", "Project ID is required").notEmpty(),
    check(
      "totalAmount",
      "Total amount is required and must be a positive number"
    ).isFloat({ min: 0 }),
    check("allocations", "Allocations must be an array if provided")
      .optional()
      .isArray(),
    check("allocations.*.category", "Category is required for each allocation")
      .optional()
      .notEmpty(),
    check(
      "allocations.*.amount",
      "Amount is required and must be a positive number for each allocation"
    )
      .optional()
      .isFloat({ min: 0 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { projectId, totalAmount, allocations } = req.body;

    const budget = await createBudget({
      projectId,
      totalAmount,
      allocations,
    });

    res.status(201).json({
      success: true,
      data: budget,
    });
  })
);

/**
 * @route   GET /api/budgets/project/:projectId
 * @desc    Get budget for a project
 * @access  Private
 */
router.get(
  "/project/:projectId",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const budget = await getProjectBudget(projectId);

    res.status(200).json({
      success: true,
      data: budget,
    });
  })
);

/**
 * @route   PUT /api/budgets/:id
 * @desc    Update budget
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  [
    check("totalAmount", "Total amount must be a positive number if provided")
      .optional()
      .isFloat({ min: 0 }),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { totalAmount } = req.body;

    const budget = await updateBudget(id, {
      totalAmount,
    });

    res.status(200).json({
      success: true,
      data: budget,
    });
  })
);

/**
 * @route   POST /api/budgets/:budgetId/allocations
 * @desc    Add budget allocation
 * @access  Private
 */
router.post(
  "/:budgetId/allocations",
  authenticate,
  [
    check("category", "Category is required").notEmpty(),
    check("amount", "Amount is required and must be a positive number").isFloat(
      { min: 0 }
    ),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { budgetId } = req.params;
    const { category, amount } = req.body;

    const allocation = await addBudgetAllocation(budgetId, {
      category,
      amount,
    });

    res.status(201).json({
      success: true,
      data: allocation,
    });
  })
);

/**
 * @route   PUT /api/budgets/allocations/:id
 * @desc    Update budget allocation
 * @access  Private
 */
router.put(
  "/allocations/:id",
  authenticate,
  [
    check("amount", "Amount is required and must be a positive number").isFloat(
      { min: 0 }
    ),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { amount } = req.body;

    const allocation = await updateBudgetAllocation(id, {
      amount,
    });

    res.status(200).json({
      success: true,
      data: allocation,
    });
  })
);

/**
 * @route   DELETE /api/budgets/allocations/:id
 * @desc    Delete budget allocation
 * @access  Private
 */
router.delete(
  "/allocations/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteBudgetAllocation(id);

    res.status(200).json({
      success: true,
      message: "Budget allocation deleted successfully",
    });
  })
);

/**
 * @route   POST /api/budgets/:budgetId/expenses
 * @desc    Add expense
 * @access  Private
 */
router.post(
  "/:budgetId/expenses",
  authenticate,
  [
    check("description", "Description is required").notEmpty(),
    check("amount", "Amount is required and must be a positive number").isFloat(
      { min: 0 }
    ),
    check("date", "Date is required and must be valid").isISO8601().toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { budgetId } = req.params;
    const { description, amount, date } = req.body;

    const result = await addExpense(budgetId, {
      description,
      amount,
      date,
    });

    res.status(201).json({
      success: true,
      data: result.expense,
      warning: result.warning,
    });
  })
);

/**
 * @route   PUT /api/budgets/expenses/:id
 * @desc    Update expense
 * @access  Private
 */
router.put(
  "/expenses/:id",
  authenticate,
  [
    check("description", "Description must not be empty if provided")
      .optional()
      .notEmpty(),
    check("amount", "Amount must be a positive number if provided")
      .optional()
      .isFloat({ min: 0 }),
    check("date", "Date must be valid if provided")
      .optional()
      .isISO8601()
      .toDate(),
    validate,
  ],
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { description, amount, date } = req.body;

    const result = await updateExpense(id, {
      description,
      amount,
      date,
    });

    res.status(200).json({
      success: true,
      data: result.expense,
      warning: result.warning,
    });
  })
);

/**
 * @route   DELETE /api/budgets/expenses/:id
 * @desc    Delete expense
 * @access  Private
 */
router.delete(
  "/expenses/:id",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    await deleteExpense(id);

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  })
);

/**
 * @route   GET /api/budgets/project/:projectId/summary
 * @desc    Get budget summary for a project
 * @access  Private
 */
router.get(
  "/project/:projectId/summary",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { projectId } = req.params;

    const summary = await getBudgetSummary(projectId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

export default router;
