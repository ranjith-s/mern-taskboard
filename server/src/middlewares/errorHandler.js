const mongoose = require('mongoose');
const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler: every error ends up here (4 args = error middleware).
// It turns known error types into proper HTTP responses, so controllers never
// have to build error responses themselves.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message;
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    // Duplicate key from a unique index, e.g. email already registered
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already exists`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (!err.isOperational && status === 500) {
    // Unknown error = bug. Log it, but never leak internals to the client.
    console.error(err);
    message = 'Something went wrong';
  }

  const body = { message };
  if (details) body.details = details;
  if (env.NODE_ENV === 'development' && status === 500) body.stack = err.stack;

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
