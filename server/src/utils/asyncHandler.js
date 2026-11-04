// Express 4 does not catch rejected promises from async handlers.
// Without this wrapper, a thrown error inside an async controller becomes an
// unhandled rejection and the request hangs. (Express 5 does this natively.)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
