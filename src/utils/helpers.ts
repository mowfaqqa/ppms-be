import { PrismaClient, ProjectMemberRole } from "@prisma/client";
const prisma = new PrismaClient();
// Helper: Define default permissions for each role
export const getRoleDefaultPermissions = async (role: ProjectMemberRole) => {
  const permissionMap = {
    PROJECT_MANAGER: [
      "project.view",
      "project.edit",
      "project.delete",
      "task.create",
      "task.edit",
      "task.delete",
      "task.assign",
    ],
    TEAM_MEMBER: ["project.view", "task.view", "task.edit", "task.create"],
    OBSERVER: ["project.view", "task.view"],
  };

  return await prisma.permission.findMany({
    where: {
      name: { in: permissionMap[role] },
    },
  });
};
