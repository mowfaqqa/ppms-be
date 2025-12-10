import express, { Express } from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "dotenv";
import { notFound, errorHandler } from "./middleware/error.middleware";
import fs from "fs";
import path from "path";

// Import routes
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import yearRoutes from "./routes/year.routes";
import portfolioRoutes from "./routes/portfolio.routes";
import programRoutes from "./routes/program.routes";
import projectRoutes from "./routes/project.routes";
import taskRoutes from "./routes/task.routes";
import taskAssignmentsRoutes from "./routes/task-assignments.routes";
import taskSubtasksRoutes from "./routes/task-subtasks.routes";
import taskTimeTrackingRoutes from "./routes/task-time-tracking.routes";
import timeRoutes from "./routes/time.routes";
import fileRoutes from "./routes/file.routes";
import notificationRoutes from "./routes/notification.routes";
import sprintRoutes from "./routes/sprint.routes";
import backlogRoutes from "./routes/backlog.routes";
import dashboardRoutes from "./routes/dashboard-activity.routes";
import settingsRoutes from "./routes/settings.routes";

// Load environment variables
config();

// Initialize Express app
const app: Express = express();

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const corsOptions = {
  origin: ["http://localhost:3000", "https://ppms-smoky.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true, // for cookies, authorization headers, etc.
};
// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/years", yearRoutes);
app.use("/api/portfolios", portfolioRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/tasks", taskAssignmentsRoutes);
app.use("/api/tasks", taskSubtasksRoutes);
app.use("/api/tasks", taskTimeTrackingRoutes);
app.use("/api/time", timeRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", sprintRoutes);
app.use("/api", backlogRoutes);
app.use("/api", dashboardRoutes);
app.use("/api/settings", settingsRoutes);

// API health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is healthy",
    timestamp: new Date(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
