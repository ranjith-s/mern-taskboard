const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

const skip = () => env.NODE_ENV === 'test';

// General API limit per IP.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: { message: 'Too many requests, please try again later' },
});

// Much stricter on login/register to slow down brute-force attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: { message: 'Too many attempts, please try again in 15 minutes' },
});

module.exports = { apiLimiter, authLimiter };
