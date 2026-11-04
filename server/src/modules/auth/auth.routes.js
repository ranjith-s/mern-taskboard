const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middlewares/validate');
const { requireAuth } = require('../../middlewares/auth');
const { authLimiter } = require('../../middlewares/rateLimit');
const { registerSchema, loginSchema } = require('./auth.schema');
const ctrl = require('./auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(ctrl.register));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(ctrl.login));
router.post('/refresh', asyncHandler(ctrl.refresh));
router.post('/logout', asyncHandler(ctrl.logout));
router.get('/me', requireAuth, asyncHandler(ctrl.me));

module.exports = router;
