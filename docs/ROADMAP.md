# Status, known limitations and roadmap

## What has been verified

| Check | Status |
|---|---|
| Backend integration tests (30, Jest + Supertest + in-memory Mongo replica set) | ✅ passing in GitHub Actions CI |
| Client production build (`vite build`) | ✅ passing in CI |
| Running the full app in a browser against a real MongoDB | ⚠️ **not yet verified**: the project was written in an environment without MongoDB. Follow "Things to try by hand" in the README and fix anything that breaks. |
| `docker compose up` | ⚠️ **not yet verified** (same reason) |

When you complete a manual check, update this table.

## Known limitations

**Functional**
- Lists can't be reordered from the UI. The API supports it (`POST /lists/:id/move`), but there is no drag handle on lists yet.
- Card search shows only the first 10 results. There is no paging UI, though the API returns `page`/`totalPages`.
- No "log out of all devices" endpoint. The logic exists inside reuse detection in `auth.service.js`.
- No password reset or email verification.
- The activity log is never trimmed; it grows forever.

**Scaling** (fine for one server; matters with several instances)
- The rate limiter uses in-memory storage, so each instance counts separately. Fix: a Redis store for `express-rate-limit`.
- Socket.IO events only reach clients on the same instance. Fix: `@socket.io/redis-adapter` and sticky sessions.
- Each realtime event makes every viewer refetch the whole board (see `docs/DECISIONS.md`).

**Setup**
- In Docker, the API runs with `NODE_ENV=production`, so the refresh cookie is `Secure`. This works on `http://localhost` in Chrome and Firefox, but **not** if you open the app via a LAN IP over plain http (login seems to work, then the session is lost on reload). Use localhost, or add HTTPS.
- `docker-compose.yml` has a fallback JWT secret. Set `JWT_ACCESS_SECRET` in a `.env` file next to it for anything beyond local use.

**Quality**
- No frontend tests and no ESLint/Prettier config.
- No API docs generator (the README table is maintained by hand).

## Roadmap (ordered by interview value)

1. **Redis cache** for `GET /boards/:id/stats`: cache-aside, invalidate on card changes, short TTL.
2. **BullMQ job**: daily email digest of cards due soon (retries, backoff, idempotency).
3. **File attachments** on cards with presigned S3 URLs (the client uploads directly to S3).
4. **Horizontal scaling demo**: two API containers behind nginx, Redis adapter for Socket.IO, Redis rate-limit store.
5. **OpenAPI/Swagger** docs generated from the Zod schemas.
6. **TypeScript** on the server.
7. Small UI gaps from "Known limitations" (list drag, search paging, log out of all devices).
