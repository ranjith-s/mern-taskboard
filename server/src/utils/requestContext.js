// Small context object handed to services, so services don't depend on
// Express's req/res and can be reused (tests, background jobs, sockets).
// x-socket-id lets us skip echoing a realtime event back to its sender.
const ctxOf = (req) => ({ user: req.user, socketId: req.get('x-socket-id') });

module.exports = { ctxOf };
