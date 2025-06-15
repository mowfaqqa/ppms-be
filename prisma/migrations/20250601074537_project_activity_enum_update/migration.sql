-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SPRINT_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'SPRINT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'SPRINT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'SPRINT_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'BACKLOG_ITEM_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'BACKLOG_ITEM_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'BACKLOG_REORDERED';
ALTER TYPE "ActivityType" ADD VALUE 'BACKLOG_ITEM_MOVED_TO_SPRINT';
ALTER TYPE "ActivityType" ADD VALUE 'BACKLOG_ITEM_MOVED_TO_BACKLOG';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_MOVED_TO_SPRINT';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_MOVED_TO_BACKLOG';

-- AlterEnum
ALTER TYPE "TaskActivityType" ADD VALUE 'TASK_CREATED';
