const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const mongoose = require('mongoose');

const env = require('./config/env');
const sanitize = require('./middlewares/sanitize');
const { apiLimiter } = require('./middlewares/rateLimit');
const { requireAuth } = require('./middlewares/auth');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const boardRoutes = require('./modules/boards/boards.routes');

// app.js builds the Express app WITHOUT listening on a port.
// server.js starts it; tests import the app directly with supertest.
const app = express();

app.set('trust proxy', 1); // correct client IP behind a load balancer (rate limiting)

// Middleware order matters: security headers -> CORS -> parsers -> sanitize -> routes -> errors
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '100kb' })); // limit body size (DoS protection)
app.use(cookieParser());
app.use(sanitize);
if (env.NODE_ENV === 'development') app.use(morgan('dev'));

// Health check for load balancers / Docker / uptime monitors.
app.get('/api/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/boards', requireAuth, boardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
