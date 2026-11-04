// Operational errors we throw on purpose (bad input, not found, forbidden...).
// The error middleware sends their message to the client. Any other error
// is a bug, so the client only gets a generic 500.
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg = 'Bad request', details) {
    return new AppError(400, msg, details);
  }
  static unauthorized(msg = 'Unauthorized') {
    return new AppError(401, msg);
  }
  static forbidden(msg = 'You do not have permission to do this') {
    return new AppError(403, msg);
  }
  static notFound(msg = 'Resource not found') {
    return new AppError(404, msg);
  }
  static conflict(msg = 'Conflict', details) {
    return new AppError(409, msg, details);
  }
}

module.exports = AppError;
