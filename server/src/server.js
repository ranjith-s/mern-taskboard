const http = require('http');
const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const { connectDB } = require('./config/db');
const { initSocket } = require('./socket');

async function start() {
  await connectDB(env.MONGO_URI);

  // Express and Socket.IO share one HTTP server (and one port).
  const server = http.createServer(app);
  const io = initSocket(server);

  server.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown: stop taking new connections, let in-flight requests
  // finish, then close the DB. Docker/Kubernetes send SIGTERM before killing.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    io.close();
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if stuck
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
