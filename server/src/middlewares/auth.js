const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/tokens');

// Access token comes in the Authorization header ("Bearer <token>").
// The client keeps it in memory (not localStorage) to reduce XSS exposure.
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Missing access token'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, name: payload.name };
    return next();
  } catch (err) {
    // The client uses this exact message to know it should call /auth/refresh
    const msg = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
    return next(AppError.unauthorized(msg));
  }
}

module.exports = { requireAuth };
