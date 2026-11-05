# Design decisions

Why the project is built the way it is. The goal was a **backend-focused practice project for
MERN interviews in India**, kept deliberately small ("don't over-engineer"). Read this before
changing a decision, so the trade-off is a conscious one.

## Language and framework

| Decision | Why | Revisit when |
|---|---|---|
| **JavaScript (CommonJS)** on the server, not TypeScript | Most Indian MERN codebases and interview questions use plain JS with `require`. Less tooling to learn. | You want TS on the résumé: convert the server (good extension task). |
| **Express 4**, not 5 | Still the most common in jobs. Keeps the classic "async errors in Express" question relevant: see `utils/asyncHandler.js`. | Upgrading: Express 5 catches async errors natively, `req.query` becomes read-only (the `validate` and `sanitize` middlewares assign to it, so they need changes). |
| **Mongoose 8**, pinned to `^8` (9 existed) | Stable, widely documented API. Mongoose 9 changes middleware signatures. | Deliberate upgrade with the test suite as a safety net. |
| **Zod** for validation | One schema = validation + type coercion + stripping unknown keys (blocks mass assignment). | – |
| **Jest + Supertest + mongodb-memory-server** | Jest is the most common in interviews. The in-memory **replica set** means tests run real queries, indexes and transactions. | – |
| Feature folders: `modules/<feature>/{routes,controller,service,schema}.js` | Shows layering clearly: routes = HTTP wiring + RBAC, controllers = req/res, services = business logic (no Express objects, take a `ctx`). | – |

## Data model

- **Members embedded in Board**: small, bounded, needed for every permission check (one read).
- **Lists and Cards in their own collections**: unbounded growth, updated independently.
- **Refresh tokens in their own collection**: many devices per user; a TTL index cleans up expired ones.
- **Card `version`** (`versionKey: 'version'`) for optimistic locking. Moves do **not** bump the version
  (moving a card shouldn't conflict with someone editing its description).
- **Fractional `position`** (float) for ordering, with rebalancing when gaps get too small
  (`utils/position.js`). The client sends only a drop **index**; the server computes the position.

## Auth

- Access token: JWT, 15 min, **kept in memory** on the client (not localStorage).
- Refresh token: random 80-hex string, **stored hashed** (SHA-256), httpOnly cookie,
  `sameSite=strict`, `path=/api/auth`, rotated on every use, reuse → revoke all of that user's sessions.
- The client shares **one in-flight refresh promise** (`client/src/api/client.js`); this is required
  because of rotation.

## Realtime

- Socket.IO, JWT checked in the handshake, one room per board, membership checked on `board:join`.
- Server emits a single `board:event` with `{ type, data, actorId }`; the sender is excluded via the
  `x-socket-id` header.
- **The client refetches the whole board** (debounced 150 ms) instead of applying each event as a patch.
  Simpler and always consistent; fine for boards with hundreds of cards. Revisit for big boards.

## Things deliberately left out

- **Redis** (caching, rate-limit store, Socket.IO adapter) and **BullMQ** job queues: kept for
  discussion in interviews and listed as extensions in `docs/ROADMAP.md`.
- A drag-and-drop **library**: native HTML5 DnD is enough here; the focus is the backend.
- Email verification and password reset: no email service to keep setup simple.

## Transactions fallback

`config/db.js#withTransaction` runs without a transaction when MongoDB is a standalone server
(plain local `mongod`), so the app still runs for people without Atlas or Docker. Production should
always be a replica set. Docker Compose runs Mongo as a single-node replica set for this reason.
