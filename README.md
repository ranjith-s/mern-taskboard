# TaskBoard: a MERN Trello-style board

A collaborative task board (workspaces → boards → lists → cards) built to practise
**backend concepts that come up in MERN interviews**: JWT auth with refresh-token rotation,
RBAC, MongoDB data modelling and indexes, transactions, optimistic locking, aggregation,
pagination, real-time updates with Socket.IO, validation, security middleware, and testing.

> 📘 **Interview prep:** read [`docs/INTERVIEW_NOTES.md`](docs/INTERVIEW_NOTES.md). It maps every
> feature to the file that implements it and the questions it helps you answer.

## Tech stack

| Layer | Choice |
|---|---|
| API | Node 22, Express 4, Mongoose 8, Zod |
| Auth | JWT access token (15 min, in memory) + opaque refresh token (7 days, httpOnly cookie, rotated) |
| Realtime | Socket.IO (JWT-authenticated, one room per board) |
| Client | React 19, Vite, React Router, Axios, native HTML5 drag & drop |
| Tests | Jest + Supertest + mongodb-memory-server (in-memory replica set) |
| Ops | Docker Compose (Mongo replica set + API + nginx), GitHub Actions CI |

## Features

- Register / login / logout, silent token refresh, and session restore after page reload
- Boards with **roles**: `owner` › `admin` › `member` › `viewer`
- Invite members by email, change roles, remove members, leave a board
- Lists and cards with drag & drop ordering (fractional indexing)
- Card details: description, labels, due date, assignees, done flag
- **Conflict detection**: if two people edit the same card, the second save gets a 409 and sees the latest version
- **Live updates**: other people's changes show up without a refresh
- Activity log (cursor pagination), card search (offset pagination), board stats (aggregation `$facet`)

## Run locally

### Option A: Docker (everything in one command)

```bash
docker compose up --build
```

Open http://localhost:8080 and sign up. (Use two browsers to see live updates.)

### Option B: Node + your own MongoDB

Needs Node 20+ and MongoDB (local `mongod` or a free Atlas cluster).

```bash
cd server
cp .env.example .env      # edit MONGO_URI if needed
npm install
npm run seed              # optional demo data
npm run dev               # API on http://localhost:5000
```

```bash
cd client
npm install
npm run dev               # http://localhost:5173 (proxies /api and /socket.io to :5000)
```

Demo logins after `npm run seed`: `asha@demo.com` (owner), `ravi@demo.com` (member),
`priya@demo.com` (viewer). The password for all of them is `password123`.

> **Transactions** need a replica set. Atlas and the Docker setup already are one. With a plain
> local `mongod`, the app falls back to running without a transaction (see `server/src/config/db.js`).
> To use the Docker Mongo from Option B, set
> `MONGO_URI=mongodb://localhost:27017/taskboard?directConnection=true`.

### Tests

```bash
cd server
npm test
```

On the first run, `mongodb-memory-server` downloads a MongoDB binary (around 100 MB).

## API

All routes are under `/api`. Board routes need `Authorization: Bearer <accessToken>`.
The **Min role** column is enforced by the `boardAccess(role)` middleware.

| Method | Route | Min role | Notes |
|---|---|---|---|
| POST | `/auth/register` | – | sets refresh cookie, returns `{ user, accessToken }` |
| POST | `/auth/login` | – | rate limited |
| POST | `/auth/refresh` | – | rotates the refresh cookie |
| POST | `/auth/logout` | – | revokes the refresh token |
| GET | `/auth/me` | – | |
| GET | `/boards` | – | boards I'm a member of |
| POST | `/boards` | – | creates board + 3 default lists (transaction) |
| GET | `/boards/:id` | viewer | board + members + lists + cards |
| PATCH | `/boards/:id` | admin | |
| DELETE | `/boards/:id` | owner | cascades in a transaction |
| GET | `/boards/:id/stats` | viewer | aggregation |
| POST | `/boards/:id/members` | admin | `{ email, role }` |
| PATCH | `/boards/:id/members/:userId` | admin | `{ role }` |
| DELETE | `/boards/:id/members/:userId` | viewer* | *anyone can leave; removing others needs admin |
| POST | `/boards/:id/lists` | member | |
| PATCH | `/boards/:id/lists/:listId` | member | rename |
| POST | `/boards/:id/lists/:listId/move` | member | `{ index }` |
| DELETE | `/boards/:id/lists/:listId` | member | deletes its cards too |
| GET | `/boards/:id/cards?q=&assignee=&label=&page=&limit=` | viewer | search |
| POST | `/boards/:id/cards` | member | `{ listId, title }` |
| PATCH | `/boards/:id/cards/:cardId` | member | needs `version` (optimistic lock) |
| POST | `/boards/:id/cards/:cardId/move` | member | `{ toListId, index }` |
| DELETE | `/boards/:id/cards/:cardId` | member | |
| GET | `/boards/:id/activity?cursor=&limit=` | viewer | cursor pagination |
| GET | `/health` | – | for load balancers |

Errors always look like `{ "message": "...", "details"?: [...] }`.

## Project structure

```
server/src
├── app.js                 # express app (no listen) – imported by tests
├── server.js              # http server + socket.io + graceful shutdown
├── config/                # env validation (zod), db connection, transaction helper
├── middlewares/           # auth, boardAccess (RBAC), validate, sanitize, rateLimit, errorHandler
├── models/                # User, RefreshToken, Board, List, Card, Activity
├── modules/<feature>/     # *.routes.js -> *.controller.js -> *.service.js (+ *.schema.js)
├── socket/                # socket.io auth + rooms + emit helpers
└── utils/                 # AppError, asyncHandler, tokens, position (fractional indexing)

client/src
├── api/                   # axios instance with refresh interceptor, socket client
├── context/AuthContext    # session state
├── pages/                 # Auth, Boards, Board
└── components/            # ListColumn, CardModal, SidePanel (activity/members/stats), SearchBox
```
