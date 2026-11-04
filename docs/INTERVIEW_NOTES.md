# Interview notes

How to use this: for each topic, read the file, then answer the questions **out loud**
without looking. Each one is written the way a MERN interviewer in India usually asks it.
Short model answers are included. Say them in your own words and **point to this project**:
"In my task board app, I did X because Y."

---

## 1. Express fundamentals

**Files:** `server/src/app.js`, `server/src/utils/asyncHandler.js`, `server/src/middlewares/errorHandler.js`

**Q: What is middleware? Does the order matter?**
A function `(req, res, next)` that runs during the request. Order matters: they run in the order
they were registered. In `app.js`: helmet → cors → json parser → cookie parser → sanitize →
routes → 404 → error handler. If the JSON parser came after the routes, `req.body` would be
undefined in the routes.

**Q: How do you handle errors centrally?**
Throw an `AppError(status, message)` anywhere. One error middleware (4 arguments:
`err, req, res, next`) turns errors into responses. It also maps Mongoose errors:
ValidationError → 400, CastError → 400, duplicate key 11000 → 409. Unknown errors are logged and
the client gets a generic 500 with no stack trace (stack traces only in development).

**Q: What happens if an async route handler throws in Express 4?**
The rejected promise is not caught: the request hangs and you get an unhandled rejection.
That is why every handler is wrapped in `asyncHandler`, which forwards the error to `next(err)`.
Express 5 does this natively.

**Q: Why are `app.js` and `server.js` separate?**
So tests can import the app and call it with Supertest without opening a port, and so the HTTP
server can be shared with Socket.IO.

**Q: What is graceful shutdown?**
On SIGTERM (sent by Docker/K8s/PM2): stop accepting connections, let in-flight requests
finish, close the DB, then exit, with a timeout that forces the exit if something hangs.
See `server.js`.

**Q: `app.use` vs `app.get`? What is `mergeParams`?**
`use` matches any method and any path that starts with the prefix. `get` matches the exact path
and only GET. Nested routers (`/boards/:boardId/cards`) need `Router({ mergeParams: true })` to
read `:boardId` from the parent route.

**Q: PUT vs PATCH?**
PUT replaces the whole resource; PATCH updates part of it. Card edits use PATCH. Moving a card
is `POST /cards/:id/move` because it is an *action* with server-side logic, not a plain field update.

**Q: Status codes used here?**
200 OK, 201 Created, 204 No Content (delete/logout), 400 validation, 401 not authenticated,
403 authenticated but not allowed, 404, 409 conflict (duplicate/optimistic lock),
429 rate limited, 500, 503 (health check when the DB is down).

---

## 2. Authentication (asked in almost every interview)

**Files:** `modules/auth/*`, `utils/tokens.js`, `models/RefreshToken.js`, `middlewares/auth.js`, `client/src/api/client.js`

**Q: Explain your auth flow.**
1. Login → server returns a short-lived **access token** (JWT, 15 min) in the JSON body and sets a
   long-lived **refresh token** (7 days) as an `httpOnly` cookie.
2. The client keeps the access token **in memory** and sends `Authorization: Bearer ...`.
3. When the API returns 401, the Axios interceptor calls `/auth/refresh` (the cookie is sent
   automatically), gets a new access token, and retries the original request.
4. On page reload, memory is empty, so the app calls `/auth/refresh` once at startup to restore the session.

**Q: Why two tokens? Why not one long JWT?**
A JWT can't be revoked before it expires (the server doesn't store it). A short access token limits
the damage if one leaks. The refresh token *is* stored server-side (hashed), so it can be revoked
on logout or theft.

**Q: Where do you store tokens? localStorage vs cookie?**
localStorage can be read by any JS on the page, so an XSS attack steals it. An httpOnly cookie
can't be read by JS. The trade-off is that cookies are sent automatically, which opens CSRF.
That is handled by `sameSite=strict` and by limiting the cookie to `path=/api/auth`.
The access token stays in a JS variable: XSS could still use it while the page is open, but
can't take it away for later use.

**Q: What is refresh token rotation and reuse detection?**
Every refresh revokes the old refresh token and issues a new one. If a revoked token is used
again, someone has a copy (attacker or user, we can't tell which), so **all** of the user's
sessions are revoked. See `auth.service.js#refresh`.

**Q: Several API calls get 401 at the same time. What happens?**
They share **one** refresh promise (`refreshPromise` in `client.js`). Without that, the second
refresh would send an already-rotated token and trigger reuse detection, logging the user out.

**Q: Why do you hash refresh tokens in the DB?**
Same reason as passwords: a leaked DB dump shouldn't give working sessions. SHA-256 is fine here
(the token is long and random); passwords need bcrypt because they are short and guessable.

**Q: How does bcrypt work? What is a salt? Cost factor?**
It's a slow hash with a random salt stored inside the hash string, so identical passwords hash
differently and rainbow tables don't help. The cost factor (12 here) makes each guess expensive.
`pre('save')` hashes only when `isModified('password')`.

**Q: What's inside a JWT? Is it encrypted?**
header.payload.signature, base64url-encoded, **not encrypted**. Anyone can read the payload, so
never put secrets in it. The signature only proves it wasn't tampered with.

**Q: Why the same error for wrong email and wrong password?**
To prevent user enumeration.

---

## 3. Authorization / RBAC

**Files:** `middlewares/boardAccess.js`, `models/Board.js`, `boards.service.js` (member rules), `boards.routes.js`

**Q: How did you implement roles?**
Roles are stored per board (a user can be admin on one board and viewer on another).
`boardAccess('admin')` loads the board *only if the user is a member*, attaches `req.board`
and `req.role`, and compares rank: `viewer(1) < member(2) < admin(3) < owner(4)`.
Each route declares its minimum role, so permissions are readable in one file.

**Q: Authentication vs authorization?**
Authentication: who are you (401). Authorization: what are you allowed to do (403).

**Q: Why return 404 instead of 403 for boards you're not in?**
To avoid revealing that the board exists.

**Q: What is IDOR? How did you prevent it?**
Insecure Direct Object Reference: changing an id in the URL to reach someone else's data.
Every list/card query includes the board: `Card.findOne({ _id: cardId, board: board._id })`.
Being a member of *your* board doesn't let you edit a card of *another* board.
There is a test for it in `cards.test.js`.

**Q: What is mass assignment?**
A client sending extra fields like `{ "role": "owner" }`. Zod schemas strip unknown keys, and
`owner` isn't an allowed value in the role enum.

---

## 4. MongoDB and Mongoose

**Files:** `models/*`, `boards.service.js#getStats`, `utils/position.js`, `config/db.js`

**Q: Embedding vs referencing? Give an example from your project.**
Members are **embedded** in Board: small, bounded, and needed on every request for permission
checks (one read). Lists and cards are **referenced** (separate collections): they grow without
limit, are updated independently, and the 16 MB document limit would become a risk.

**Q: Which indexes did you create and why?**
- `users.email` unique: fast login and no duplicates, even under race conditions
- `boards.members.user`: multikey index for "my boards"
- `cards { list: 1, position: 1 }`: compound index; cards of a list in order without an in-memory sort
- `cards { board: 1, assignees: 1 }`: search and filter by assignee
- `cards` text index on title + description
- `activities { board: 1, _id: -1 }`: newest-first feed per board
- `refreshtokens.expiresAt` **TTL index**: Mongo deletes expired tokens automatically

Use `.explain('executionStats')` to show IXSCAN vs COLLSCAN.

**Q: What is the ESR rule for compound indexes?**
Equality fields first, then Sort, then Range. `{ list: 1, position: 1 }` = equality on list,
sort on position.

**Q: `populate` vs `$lookup`?**
`populate` runs extra queries from Node (simple, used for the board page).
`$lookup` joins inside the DB in an aggregation (used in stats). Both are slower than embedding,
so use them only when needed.

**Q: Explain your aggregation pipeline.**
`getStats`: `$match` the board → `$facet` runs 3 sub-pipelines on the same input: totals
(`$group` with `$cond` sums), cards per list (`$group` → `$lookup` lists → `$sort`), and workload
per assignee (`$unwind` assignees → `$group` → `$lookup` users). Always put `$match` first so it
can use an index and reduce documents early.

**Q: When do you need a transaction? Requirements?**
When several writes must succeed or fail together: deleting a board plus its lists, cards and
activity; creating a board plus its default lists. Transactions need a replica set (Atlas has one;
docker-compose runs a single-node one). Single-document operations are already atomic, so you
don't need a transaction for those.

**Q: `lean()`, what and when?**
Returns plain JS objects instead of Mongoose documents. Faster and uses less memory for read-only
responses. Don't use it when you need `.save()` or virtuals.

**Q: How do you keep the order of cards?**
Fractional indexing: each card has a float `position`. Moving a card between two others sets
`position = (a + b) / 2`, which is **one write** instead of renumbering the whole list. When the
gap becomes too small, the list is rebalanced with one `bulkWrite`. The client sends only the drop
`index`, and the server works out the neighbours.

---

## 5. Concurrency and race conditions (senior-level differentiator)

**Q: Two users edit the same card. How do you avoid losing an update?**
**Optimistic locking** (`cards.service.js#updateCard`). Each card has a `version`. The update is
`findOneAndUpdate({ _id, version: clientVersion }, { $set: ..., $inc: { version: 1 } })`.
If someone saved first, nothing matches → **409** with the latest card, and the UI shows a "changed
by someone else" message. No locks are held. The alternative, pessimistic locking, means locking
before editing: safer under heavy contention, but slower and you have to deal with stale locks.

**Q: Any other race conditions you handled?**
- Adding a member: `updateOne({ _id, 'members.user': { $ne: userId } }, { $push })` is an atomic check-and-insert. A separate `find` followed by `push` could add the same user twice.
- Registration: the unique index on email is the real guarantee. The `exists` check only gives a nicer message.
- Refresh tokens: `findOneAndUpdate({ _id, revokedAt: null })` means only one of two parallel refreshes wins.

---

## 6. Pagination, search, performance

**Q: Offset vs cursor pagination?**
Offset (`skip/limit`, used for card search) is simple and supports "page 3 of 10", but deep pages
are slow (Mongo still walks the skipped docs) and results shift when new rows are inserted.
Cursor (`_id < lastSeenId`, used for the activity feed) uses the index directly, is stable, and
suits infinite scroll, but you can't jump to page N.

**Q: How do you prevent regex injection / ReDoS in search?**
Escape user input before building a `RegExp` (`escapeRegex`). A test checks that `.*` matches nothing.

**Q: Debouncing on the frontend?**
`SearchBox` waits 300 ms after typing stops and aborts stale requests with `AbortController`.

**Q: How would you add caching?** *(not built; be ready to discuss)*
Redis cache-aside for `GET /boards/:id/stats`: key `stats:<boardId>`, short TTL, deleted on any
card change in that board. Explain cache invalidation and why the TTL is a safety net.

---

## 7. Real-time (Socket.IO)

**Files:** `server/src/socket/index.js`, `client/src/pages/BoardPage.jsx`

**Q: How does it work?**
The socket authenticates once in the handshake with the same JWT (`io.use`). The client emits
`board:join`; the server checks membership before `socket.join('board:<id>')`. After each change,
services emit `board:event` to that room. Clients debounce events into a single refetch.

**Q: Why not send the change to the user who made it?**
Their UI already updated from the HTTP response (optimistically for drag & drop). The client sends
its socket id in the `x-socket-id` header, and the server uses `.except(socketId)`.

**Q: WebSockets vs polling vs SSE?**
Polling: simple, but wasteful and delayed. SSE: server → client only, over plain HTTP.
WebSocket: two-way and low latency. Socket.IO adds rooms, automatic reconnection and a fallback.

**Q: How does this scale to multiple servers?** *(be ready to discuss)*
A user on server A doesn't receive events emitted on server B. Use the **Socket.IO Redis adapter**
(pub/sub between instances) plus sticky sessions on the load balancer.

**Q: The access token expires while the socket is connected?**
The connection stays open: auth happens only at the handshake. On reconnect, the client gets
`connect_error: Unauthorized`, refreshes the token and reconnects (`AuthContext.jsx`).

---

## 8. Security checklist (good to list confidently)

| Threat | Mitigation in this app |
|---|---|
| XSS stealing tokens | refresh token in httpOnly cookie, access token in memory, React escapes output |
| CSRF | `sameSite=strict` cookie, path-limited; the API uses Bearer headers, not cookies |
| NoSQL injection (`{"$ne": null}`) | `sanitize` middleware strips `$`/`.` keys; Zod type checks |
| Brute force | `express-rate-limit`: 20 auth attempts per 15 min per IP |
| Big payload DoS | `express.json({ limit: '100kb' })` |
| Security headers | `helmet()` |
| CORS | only `CLIENT_URL`, with credentials |
| Leaking internals | generic 500 message, no stack in production, `password` has `select: false` |
| Bad config | env validated with Zod at startup; refuses the dev JWT secret in production |
| IDOR / mass assignment | queries scoped by board; Zod strips unknown keys |

---

## 9. Testing

**Files:** `server/tests/*`

**Q: How do you test your API?**
Integration tests with Jest + Supertest against an **in-memory MongoDB replica set**
(mongodb-memory-server), so they run the real queries, indexes and transactions without touching
a real DB. Collections are wiped after each test. Covered: auth flows (rotation, reuse detection,
injection), RBAC per role, IDOR, optimistic locking, ordering/rebalancing, both pagination styles,
aggregation, cascading deletes.

**Q: Unit vs integration tests?**
Unit: one function in isolation with dependencies mocked. Integration: several layers together
(route → DB). For a CRUD API, integration tests catch more real bugs per test.

---

## 10. Node.js theory they will also ask (not specific to this app)

Revise these separately. They come up alongside project questions:
- Event loop phases; `process.nextTick` vs `setImmediate` vs `setTimeout(0)`; microtasks vs macrotasks
- Node being single-threaded: what blocks the event loop (CPU work, sync fs), and `worker_threads` vs `cluster` vs PM2
- Streams and backpressure (e.g. exporting a large CSV with a stream instead of loading it into memory)
- CommonJS vs ES modules (this project uses CommonJS on the server, ESM in the React client)
- `Promise.all` vs `allSettled` vs `race` (`getBoardDetail` runs 3 queries with `Promise.all`)

---

## Extensions if you have more time (each adds a strong talking point)

1. **Redis cache** for board stats (cache-aside + invalidation)
2. **BullMQ job queue**: email a daily digest of due cards (retries, backoff, idempotent jobs)
3. **File attachments** on cards: presigned S3 URLs (the client uploads directly, not through Node)
4. **Socket.IO Redis adapter** and run 2 API containers behind nginx
5. Swagger/OpenAPI docs from the Zod schemas
6. Convert the server to TypeScript
