import { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";

const prisma = new PrismaClient();

export const programManagerHasPortfolioAccess = async (
  userId: string,
  portfolioId: string
): Promise<boolean> => {
  const count = await prisma.portfolio.count({
    where: {
      id: portfolioId,
      programManagers: {
        some: { id: userId },
      },
    },
  });

  return count > 0;
};

export const getPortfolioScope = (user: {
  role: Role;
  userId: string;
}) => {
  if (user.role === "PROGRAM_MANAGER") {
    return {
      managers: {
        some: { id: user.userId },
      },
    };
  }

  // ADMIN has complete access
  return {};
};
