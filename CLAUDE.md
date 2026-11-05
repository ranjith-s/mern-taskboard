# CLAUDE.md

Guide for anyone (human or AI) working on this repo. Purpose of the project: a **backend-focused
MERN practice app for interviews**. Keep changes simple and explainable in an interview; don't add
infrastructure without a clear learning reason.

Read first: `README.md` (setup + API), `docs/DECISIONS.md` (why things are the way they are),
`docs/ROADMAP.md` (what's verified, known gaps, next features), `docs/INTERVIEW_NOTES.md` (concept → file map).

## Commands

```bash
# server/
npm run dev      # API on :5000 (needs MongoDB, see server/.env.example)
npm run seed     # demo users asha/ravi/priya@demo.com, password123 (WIPES the database)
npm test         # Jest; starts its own in-memory MongoDB replica set
# client/
npm run dev      # Vite on :5173, proxies /api and /socket.io to :5000
npm run build
# root
docker compose up --build   # full stack on :8080
```

CI (`.github/workflows/ci.yml`) runs server tests and the client build on every push.

## Server conventions (`server/src`)

- CommonJS (`require`), Express 4. Wrap every async handler in `asyncHandler`.
- A feature lives in `modules/<feature>/`:
  - `*.routes.js`: path + `boardAccess('<minRole>')` + `validate({ params, query, body })` + controller
  - `*.controller.js`: reads `req`, calls the service with `ctxOf(req)`, sends the response. No business logic.
  - `*.service.js`: business logic and DB access. **Never** touches `req`/`res`.
  - `*.schema.js`: Zod schemas
- Throw `AppError.badRequest/unauthorized/forbidden/notFound/conflict(...)`; never send error responses
  by hand. `middlewares/errorHandler.js` formats everything as `{ message, details? }`.
- Board-scoped resources are mounted under `/api/boards/:boardId/...` with `Router({ mergeParams: true })`.
  **Always query child documents with the board id** (`{ _id, board: board._id }`) to prevent IDOR.
- Roles: `viewer < member < admin < owner` (`models/Board.js#ROLE_RANK`). Reads = viewer, writes = member,
  board settings and members = admin, delete board = owner.
- After a change in a service: `logActivity(...)` if it's user-visible history, then
  `emitToBoard(boardId, 'board:event', { type, data, actorId }, ctx.socketId)`.
- Multi-document writes that must succeed together go through `withTransaction` (`config/db.js`).
- Card content updates must keep **optimistic locking** (`version` in the filter + `$inc`). Avoid
  `card.save()` for cards: Mongoose would bump `version` on array changes too.
- Ordering uses `positionAtIndex` (`utils/position.js`): the API accepts an `index`, never a raw position.

## Client conventions (`client/src`)

- Use the axios instance from `api/client.js` (adds the token and `x-socket-id`, and handles refresh). Never store
  tokens in localStorage.
- Board page reloads data on socket `board:event`. If you add a new event type, the board page picks it
  up automatically unless it needs special handling (see `board.deleted` / `member.removed`).
- Plain CSS in `styles.css` using CSS variables (light + dark).

## Adding a feature checklist

1. Model change (+ index if you query by it) → 2. Zod schema → 3. service → 4. controller →
5. route with the right min role → 6. tests in `server/tests` (happy path + permission + validation) →
7. UI → 8. update the README API table, and `docs/INTERVIEW_NOTES.md` if it teaches a new concept,
and `docs/ROADMAP.md` if it closes a known gap.

## Gotchas

- Tests need the env var `NODE_ENV=test` (Jest sets it), which disables rate limiting.
- The first `npm test` downloads a MongoDB binary (~100 MB).
- Transactions silently fall back to non-transactional on a standalone `mongod`; tests use a replica set,
  so they do exercise the transaction path.
