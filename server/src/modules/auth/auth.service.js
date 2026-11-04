const User = require('../../models/User');
const RefreshToken = require('../../models/RefreshToken');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} = require('../../utils/tokens');

async function issueTokens(user) {
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

async function register({ name, email, password }) {
  // The unique index on email is the real guarantee (two concurrent requests
  // could both pass this check); the check just gives a friendlier message.
  if (await User.exists({ email })) throw AppError.conflict('Email is already registered');
  const user = await User.create({ name, email, password });
  return { user, ...(await issueTokens(user)) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  // Same message for "no such user" and "wrong password": don't reveal
  // which emails are registered (user enumeration).
  if (!user || !(await user.comparePassword(password))) {
    throw AppError.unauthorized('Invalid email or password');
  }
  return { user, ...(await issueTokens(user)) };
}

/**
 * Refresh token ROTATION with REUSE DETECTION.
 *
 * Every refresh revokes the old token and issues a new one. A refresh token
 * should therefore be used only once. If a token that was ALREADY revoked
 * shows up again, someone copied it (attacker or victim, we can't tell
 * which) -> revoke every session of that user and make them log in again.
 */
async function refresh(rawToken) {
  if (!rawToken) throw AppError.unauthorized('No refresh token');

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { user: stored.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw AppError.unauthorized('Refresh token reuse detected, please log in again');
  }

  // Atomic "revoke only if not revoked yet": if two requests race with the
  // same token, only one of them wins.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (!claimed) throw AppError.unauthorized('Invalid refresh token');

  const user = await User.findById(stored.user);
  if (!user) throw AppError.unauthorized('User no longer exists');

  return { user, ...(await issueTokens(user)) };
}

async function logout(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

module.exports = { register, login, refresh, logout };
