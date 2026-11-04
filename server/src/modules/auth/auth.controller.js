const env = require('../../config/env');
const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const authService = require('./auth.service');

const COOKIE_NAME = 'refreshToken';

// Refresh token lives in an httpOnly cookie: JavaScript (and therefore XSS)
// cannot read it. `path` limits it to the auth routes, so it is not sent with
// every API call. sameSite=strict blocks it on cross-site requests (CSRF).
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};
// clearCookie must use the same path/flags, otherwise the browser keeps the cookie.
const { maxAge, ...clearOptions } = cookieOptions;

function sendAuth(res, status, { user, accessToken, refreshToken }) {
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
  res.status(status).json({ user, accessToken });
}

exports.register = async (req, res) => {
  sendAuth(res, 201, await authService.register(req.body));
};

exports.login = async (req, res) => {
  sendAuth(res, 200, await authService.login(req.body));
};

exports.refresh = async (req, res) => {
  try {
    sendAuth(res, 200, await authService.refresh(req.cookies[COOKIE_NAME]));
  } catch (err) {
    res.clearCookie(COOKIE_NAME, clearOptions);
    throw err;
  }
};

exports.logout = async (req, res) => {
  await authService.logout(req.cookies[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, clearOptions);
  res.status(204).end();
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw AppError.unauthorized('User no longer exists');
  res.json({ user });
};
