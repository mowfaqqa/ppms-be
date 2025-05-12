import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Create permissions
  const permissions = [
    { name: "project.view", description: "View project details" },
    { name: "project.edit", description: "Edit project details" },
    { name: "project.delete", description: "Delete projects" },
    { name: "task.view", description: "View tasks" },
    { name: "task.create", description: "Create tasks" },
    { name: "task.edit", description: "Edit tasks" },
    { name: "task.delete", description: "Delete tasks" },
    { name: "user.view", description: "View user details" },
    { name: "user.edit", description: "Edit user details" },
    { name: "user.delete", description: "Delete users" },
    { name: "file.upload", description: "Upload files" },
    { name: "file.download", description: "Download files" },
    { name: "file.delete", description: "Delete files" },
    { name: "budget.view", description: "View budget details" },
    { name: "budget.edit", description: "Edit budget details" },
    { name: "report.view", description: "View reports" },
    { name: "report.create", description: "Create reports" },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {},
      create: permission,
    });
  }

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin User",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  console.log("Database has been seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
