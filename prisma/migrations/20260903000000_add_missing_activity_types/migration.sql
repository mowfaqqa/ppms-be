-- Add ActivityType values emitted by the sprint and backlog services
-- (SPRINT_STARTED, SPRINT_CANCELLED, BACKLOG_ITEM_UPDATED) which were
-- missing from the enum and caused PrismaClientValidationError at runtime.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SPRINT_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SPRINT_CANCELLED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'BACKLOG_ITEM_UPDATED';
