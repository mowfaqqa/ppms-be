import http from 'http';
import app from './app';
import { PrismaClient } from '@prisma/client';
import { initializeSocketServer } from './websocket/socket';
import logger from './config/logger';
import cron from 'node-cron';
// import { notifyDeadlineApproaching } from './services/notification.service';

// Initialize Prisma client
const prisma = new PrismaClient();

// Get port from environment and store in Express
const port = process.env.PORT || 4400;
app.set('port', port);

// Create HTTP server
const server = http.createServer(app);

// Initialize socket.io server
initializeSocketServer(server);

// Connect to database, then start server
async function startServer() {
  try {
    // Connect to database
    await prisma.$connect();
    logger.info('Connected to database');

    // Schedule deadline notifications job (runs at 8:00 AM every day)
    // cron.schedule('0 8 * * *', async () => {
    //   try {
    //     logger.info('Running deadline notifications job');
    //     const count = await notifyDeadlineApproaching();
    //     logger.info(`Created ${count} deadline notifications`);
    //   } catch (error) {
    //     logger.error('Error in deadline notifications job:', error);
    //   }
    // });

    // Start server
    server.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
});

// Start the server
startServer();

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    // Close database connection
    await prisma.$disconnect();
    logger.info('Disconnected from database');
    
    // Close server
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);