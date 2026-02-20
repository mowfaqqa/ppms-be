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
      programManagers: {
        some: { id: user.userId },
      },
    };
  }

  // ADMIN has complete access
  return {};
};

export const getNestedPortfolioScope = (user: {
  role: Role;
  userId: string;
}) => {
  if (user.role === "PROGRAM_MANAGER") {
    return {
      portfolio: {
        programManagers: {
          some: { id: user.userId },
        },
      },
    };
  }

  // ADMIN has complete access
  return {};
};

export const getProjectScope = (user: { role: Role; userId: string }) => {
  if (user.role === "PROJECT_MANAGER") {
    return {
      project: {
        members: {
          some: {
            userId: user.userId,
            role: "PROJECT_MANAGER",
          },
        },
      },
    };
  }

  if (user.role === "TEAM_MEMBER") {
    return {
      project: {
        members: {
          some: {
            userId: user.userId,
            role: "TEAM_MEMBER",
          },
        },
      },
    };
  }

  return {}; // ADMIN
}

export const getNestedProjectScope = (user: { role: Role; userId: string }) => {
  if (user.role === "PROJECT_MANAGER") {
    return {
      members: {
        some: {
          userId: user.userId,
          role: "PROJECT_MANAGER",
        },
      },
    };
  }

  if (user.role === "TEAM_MEMBER") {
    return {
      members: {
        some: {
          userId: user.userId,
          role: "TEAM_MEMBER",
        },
      },
    };
  }

  return {}; // ADMIN
}

export const getTaskScope = (user: { role: Role; userId: string }) => {
  if (user.role === "PROGRAM_MANAGER") {
    return {
      project: getNestedPortfolioScope(user),
    };
  }

  if (user.role === "PROJECT_MANAGER") {
    return {
      project: {
        members: {
          some: {
            userId: user.userId,
            role: "PROJECT_MANAGER",
          },
        },
      },
    };
  }
  
  if (user.role === "TEAM_MEMBER") {
    return {
      project: {
        members: {
          some: {
            userId: user.userId,
            role: "TEAM_MEMBER",
          },
        },
      },
    };
  }

  return {}; // ADMIN
};
