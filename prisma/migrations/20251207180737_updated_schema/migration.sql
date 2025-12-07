/*
  Warnings:

  - You are about to drop the column `pillarId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the `Pillar` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `portfolioId` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Pillar" DROP CONSTRAINT "Pillar_portfolioId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_pillarId_fkey";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "pillarId",
ADD COLUMN     "portfolioId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Pillar";

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
