/*
  Warnings:

  - You are about to drop the column `portfolioId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "portfolioId";

-- CreateTable
CREATE TABLE "_ProgramManagerPortfolios" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProgramManagerPortfolios_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProgramManagerPortfolios_B_index" ON "_ProgramManagerPortfolios"("B");

-- AddForeignKey
ALTER TABLE "_ProgramManagerPortfolios" ADD CONSTRAINT "_ProgramManagerPortfolios_A_fkey" FOREIGN KEY ("A") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProgramManagerPortfolios" ADD CONSTRAINT "_ProgramManagerPortfolios_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
