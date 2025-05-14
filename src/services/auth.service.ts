import { PrismaClient, User, Role } from "@prisma/client";
import { hashPassword, comparePassword } from "../utils/password.utils";
import { generateToken } from "../utils/jwt.utils";
import { ApiError, HttpStatus } from "../utils/error.utils";

const prisma = new PrismaClient();

// Register new user
export const register = async (
  email: string,
  password: string,
  name: string,
  role: Role = "TEAM_MEMBER"
): Promise<{ user: User; token: string }> => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ApiError(HttpStatus.CONFLICT, "User already exists");
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create new user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role,
    },
  });

  // Generate token
  const token = generateToken({
    userId: user.id,
    role: user.role,
  });

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword as User,
    token,
  };
};

// Login user
export const login = async (
  email: string,
  password: string
): Promise<{ user: User; token: string }> => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  // Generate token
  const token = generateToken({
    userId: user.id,
    role: user.role,
  });

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword as User,
    token,
  };
};
