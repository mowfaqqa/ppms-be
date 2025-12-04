/*
  Warnings:

  - The values [DEADLINE_APPROACHING] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - The `entityType` column on the `Notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'BUDGET';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ASSIGNED', 'PROJECT_REMOVED', 'PROJECT_STATUS_CHANGED', 'PROJECT_DEADLINE_APPROACHING', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UNASSIGNED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED', 'TASK_COMMENT', 'TASK_DEADLINE_APPROACHING', 'TASK_OVERDUE', 'SPRINT_STARTED', 'SPRINT_COMPLETED', 'SPRINT_TASK_ADDED', 'BUDGET_ALERT', 'EXPENSE_ADDED', 'BUDGET_EXCEEDED', 'FILE_UPLOADED', 'FILE_SHARED', 'TEAM_MEMBER_ADDED', 'TEAM_MEMBER_REMOVED', 'MENTION', 'SYSTEM_ANNOUNCEMENT', 'ACCOUNT_UPDATE');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "entityName" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "entityType",
ADD COLUMN     "entityType" "EntityType";

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_read_idx" ON "Notification"("userId", "type", "read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
