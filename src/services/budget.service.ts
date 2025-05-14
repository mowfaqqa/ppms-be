import { PrismaClient } from "@prisma/client";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Create budget for project
export const createBudget = async (data: {
  projectId: string;
  totalAmount: number;
  allocations?: {
    category: string;
    amount: number;
  }[];
}): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Check if budget already exists for project
  const existingBudget = await prisma.budget.findUnique({
    where: { projectId: data.projectId },
  });

  if (existingBudget) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "Budget already exists for this project"
    );
  }

  // Validate allocations total doesn't exceed budget total
  const allocations = data.allocations || [];
  const allocationsTotal = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0
  );

  if (allocationsTotal > data.totalAmount) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Sum of allocations exceeds total budget"
    );
  }

  // Create budget with allocations in a transaction
  return prisma.$transaction(async (tx) => {
    // Create budget
    const budget = await tx.budget.create({
      data: {
        projectId: data.projectId,
        totalAmount: data.totalAmount,
      },
    });

    // Create allocations if provided
    if (allocations.length > 0) {
      await Promise.all(
        allocations.map((allocation) =>
          tx.budgetAllocation.create({
            data: {
              budgetId: budget.id,
              category: allocation.category,
              amount: allocation.amount,
            },
          })
        )
      );
    }

    // Return budget with allocations
    return tx.budget.findUnique({
      where: { id: budget.id },
      include: {
        allocations: true,
      },
    });
  });
};

// Get budget for project
export const getProjectBudget = async (projectId: string): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get budget with allocations and expenses
  const budget = await prisma.budget.findUnique({
    where: { projectId },
    include: {
      allocations: true,
      expenses: {
        orderBy: {
          date: "desc",
        },
      },
    },
  });

  if (!budget) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "Budget not found for this project"
    );
  }

  // Calculate totals and remaining budget
  const totalExpenses = budget.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const remainingBudget = budget.totalAmount - totalExpenses;
  const percentSpent = (totalExpenses / budget.totalAmount) * 100;

  // Calculate allocation usage
  const allocationsWithUsage = budget.allocations.map((allocation) => {
    // Filter expenses by category
    const expensesForCategory = budget.expenses.filter((expense) =>
      expense.description.includes(allocation.category)
    );

    const categoryExpenses = expensesForCategory.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    return {
      ...allocation,
      spent: categoryExpenses,
      remaining: allocation.amount - categoryExpenses,
      percentSpent: (categoryExpenses / allocation.amount) * 100,
    };
  });

  return {
    ...budget,
    totalExpenses,
    remainingBudget,
    percentSpent,
    allocations: allocationsWithUsage,
  };
};

// Update budget
export const updateBudget = async (
  id: string,
  data: {
    totalAmount?: number;
  }
): Promise<any> => {
  // Check if budget exists
  const budget = await prisma.budget.findUnique({
    where: { id },
    include: {
      expenses: true,
    },
  });

  if (!budget) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Budget not found");
  }

  // If updating total amount, check if it's not less than current expenses
  if (data.totalAmount !== undefined) {
    const totalExpenses = budget.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    if (data.totalAmount < totalExpenses) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "New budget amount cannot be less than current expenses"
      );
    }
  }

  // Update budget
  return prisma.budget.update({
    where: { id },
    data: {
      totalAmount: data.totalAmount,
    },
    include: {
      allocations: true,
      expenses: true,
    },
  });
};

// Add budget allocation
export const addBudgetAllocation = async (
  budgetId: string,
  data: {
    category: string;
    amount: number;
  }
): Promise<any> => {
  // Check if budget exists
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      allocations: true,
    },
  });

  if (!budget) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Budget not found");
  }

  // Check if category already exists
  const existingAllocation = budget.allocations.find(
    (allocation) => allocation.category === data.category
  );

  if (existingAllocation) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      `Allocation for category '${data.category}' already exists`
    );
  }

  // Check if new allocation would exceed total budget
  const currentAllocationsTotal = budget.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0
  );

  if (currentAllocationsTotal + data.amount > budget.totalAmount) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Adding this allocation would exceed the total budget"
    );
  }

  // Create allocation
  return prisma.budgetAllocation.create({
    data: {
      budgetId,
      category: data.category,
      amount: data.amount,
    },
  });
};

// Update budget allocation
export const updateBudgetAllocation = async (
  id: string,
  data: {
    amount: number;
  }
): Promise<any> => {
  // Check if allocation exists
  const allocation = await prisma.budgetAllocation.findUnique({
    where: { id },
    include: {
      budget: {
        include: {
          allocations: true,
        },
      },
    },
  });

  if (!allocation) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Budget allocation not found");
  }

  // Check if new amount would exceed total budget
  const currentAllocationsTotal = allocation.budget.allocations.reduce(
    (sum, a) => sum + (a.id === id ? 0 : a.amount),
    0
  );

  if (currentAllocationsTotal + data.amount > allocation.budget.totalAmount) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "This allocation would exceed the total budget"
    );
  }

  // Update allocation
  return prisma.budgetAllocation.update({
    where: { id },
    data: {
      amount: data.amount,
    },
  });
};

// Delete budget allocation
export const deleteBudgetAllocation = async (id: string): Promise<void> => {
  // Check if allocation exists
  const allocation = await prisma.budgetAllocation.findUnique({
    where: { id },
  });

  if (!allocation) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Budget allocation not found");
  }

  await prisma.budgetAllocation.delete({
    where: { id },
  });
};

// Add expense
export const addExpense = async (
  budgetId: string,
  data: {
    description: string;
    amount: number;
    date: Date;
  }
): Promise<any> => {
  // Check if budget exists
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      expenses: true,
    },
  });

  if (!budget) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Budget not found");
  }

  // Calculate current total expenses
  const currentExpensesTotal = budget.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  // Check if new expense would exceed budget
  if (currentExpensesTotal + data.amount > budget.totalAmount) {
    // Allow exceeding budget but return a warning
    const warning = "This expense will exceed the total budget";

    // Create expense
    const expense = await prisma.expense.create({
      data: {
        budgetId,
        description: data.description,
        amount: data.amount,
        date: new Date(data.date),
      },
    });

    return {
      expense,
      warning,
    };
  }

  // Create expense
  return {
    expense: await prisma.expense.create({
      data: {
        budgetId,
        description: data.description,
        amount: data.amount,
        date: new Date(data.date),
      },
    }),
  };
};

// Update expense
export const updateExpense = async (
  id: string,
  data: {
    description?: string;
    amount?: number;
    date?: Date;
  }
): Promise<any> => {
  // Check if expense exists
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      budget: {
        include: {
          expenses: true,
        },
      },
    },
  });

  if (!expense) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
  }

  // If updating amount, check if it would exceed budget
  if (data.amount !== undefined && data.amount !== expense.amount) {
    // Calculate current total expenses excluding this expense
    const currentExpensesTotal = expense.budget.expenses.reduce(
      (sum, e) => sum + (e.id === id ? 0 : e.amount),
      0
    );

    // Check if new expense would exceed budget
    if (currentExpensesTotal + data.amount > expense.budget.totalAmount) {
      // Allow exceeding budget but return a warning
      const warning = "This expense will exceed the total budget";

      // Update expense
      const updatedExpense = await prisma.expense.update({
        where: { id },
        data: {
          description: data.description,
          amount: data.amount,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      return {
        expense: updatedExpense,
        warning,
      };
    }
  }

  // Update expense
  return {
    expense: await prisma.expense.update({
      where: { id },
      data: {
        description: data.description,
        amount: data.amount,
        date: data.date ? new Date(data.date) : undefined,
      },
    }),
  };
};

// Delete expense
export const deleteExpense = async (id: string): Promise<void> => {
  // Check if expense exists
  const expense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!expense) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
  }

  await prisma.expense.delete({
    where: { id },
  });
};

// Get budget summary for project
export const getBudgetSummary = async (projectId: string): Promise<any> => {
  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
  }

  // Get budget
  const budget = await prisma.budget.findUnique({
    where: { projectId },
    include: {
      allocations: true,
      expenses: true,
    },
  });

  if (!budget) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "Budget not found for this project"
    );
  }

  // Calculate total expenses
  const totalExpenses = budget.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  // Calculate expenses by month
  const expensesByMonth: Record<string, number> = {};
  budget.expenses.forEach((expense) => {
    const month = expense.date.toISOString().substring(0, 7); // YYYY-MM format
    expensesByMonth[month] = (expensesByMonth[month] || 0) + expense.amount;
  });

  // Calculate expenses by category (using allocation categories)
  const expensesByCategory: Record<string, number> = {};
  budget.allocations.forEach((allocation) => {
    expensesByCategory[allocation.category] = 0;
  });

  // Add 'Unallocated' category for expenses that don't match any allocation
  expensesByCategory["Unallocated"] = 0;

  // Assign expenses to categories based on description containing category name
  budget.expenses.forEach((expense) => {
    const matchingCategory = Object.keys(expensesByCategory).find(
      (category) =>
        category !== "Unallocated" && expense.description.includes(category)
    );

    if (matchingCategory) {
      expensesByCategory[matchingCategory] += expense.amount;
    } else {
      expensesByCategory["Unallocated"] += expense.amount;
    }
  });

  return {
    budget: {
      id: budget.id,
      totalAmount: budget.totalAmount,
      totalExpenses,
      remainingBudget: budget.totalAmount - totalExpenses,
      percentSpent: (totalExpenses / budget.totalAmount) * 100,
    },
    allocations: budget.allocations.map((allocation) => ({
      id: allocation.id,
      category: allocation.category,
      amount: allocation.amount,
      spent: expensesByCategory[allocation.category] || 0,
      remaining:
        allocation.amount - (expensesByCategory[allocation.category] || 0),
      percentSpent:
        ((expensesByCategory[allocation.category] || 0) / allocation.amount) *
        100,
    })),
    expenses: {
      total: totalExpenses,
      byMonth: expensesByMonth,
      byCategory: expensesByCategory,
      recent: budget.expenses
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5), // Get 5 most recent expenses
    },
  };
};
