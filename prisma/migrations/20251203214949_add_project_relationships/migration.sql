-- CreateTable
CREATE TABLE "project_relationships" (
    "id" TEXT NOT NULL,
    "fromProjectId" TEXT NOT NULL,
    "toProjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_relationships_fromProjectId_idx" ON "project_relationships"("fromProjectId");

-- CreateIndex
CREATE INDEX "project_relationships_toProjectId_idx" ON "project_relationships"("toProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_relationships_fromProjectId_toProjectId_key" ON "project_relationships"("fromProjectId", "toProjectId");

-- AddForeignKey
ALTER TABLE "project_relationships" ADD CONSTRAINT "project_relationships_fromProjectId_fkey" FOREIGN KEY ("fromProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_relationships" ADD CONSTRAINT "project_relationships_toProjectId_fkey" FOREIGN KEY ("toProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
