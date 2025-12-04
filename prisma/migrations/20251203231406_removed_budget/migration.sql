/*
  Warnings:

  - The values [BUDGET] on the enum `EntityType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `budgetId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `budget` on the `Portfolio` table. All the data in the column will be lost.
  - You are about to drop the `Budget` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BudgetAllocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EntityType_new" AS ENUM ('USER', 'PROJECT', 'TASK', 'FILE', 'SPRINT', 'BACKLOG_ITEM', 'EXPENSE', 'SETTING', 'PERMISSION', 'PROJECT_MEMBER', 'TASK_ASSIGNMENT');
ALTER TABLE "audit_logs" ALTER COLUMN "entityType" TYPE "EntityType_new" USING ("entityType"::text::"EntityType_new");
ALTER TYPE "EntityType" RENAME TO "EntityType_old";
ALTER TYPE "EntityType_new" RENAME TO "EntityType";
DROP TYPE "EntityType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Budget" DROP CONSTRAINT "Budget_projectId_fkey";

-- DropForeignKey
ALTER TABLE "BudgetAllocation" DROP CONSTRAINT "BudgetAllocation_budgetId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_budgetId_fkey";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "budgetId";

-- AlterTable
ALTER TABLE "Portfolio" DROP COLUMN "budget";

-- DropTable
DROP TABLE "Budget";

-- DropTable
DROP TABLE "BudgetAllocation";
