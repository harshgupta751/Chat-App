# Echo Chat

**Real-time private chat rooms with Redis-powered horizontal scaling.**

Echo is a full-stack WebSocket chat application built with Node.js, React, and Redis. It uses Redis Pub/Sub to fan out messages across multiple server instances, Redis Streams to persist message history, and Redis Sets for distributed room membership — making it production-ready and horizontally scalable.

---

## Architecture

```
Clients (Browser)
      │  WebSocket
      ▼
  Nginx (load balancer + WS proxy)
      │  round-robin / ip_hash
  ┌───┴────────────────────┐
  │  Node.js Instance 1    │
  │  Node.js Instance 2    │  ◄── any number of replicas
  │  Node.js Instance N    │
  └───────────┬────────────┘
              │  Pub/Sub + Streams + Sets
              ▼
          Redis 7
```

When a user sends a message on Instance 1, the server publishes it to a Redis Pub/Sub channel (`room:<roomId>`). All instances subscribe to that channel via a pattern subscription and fan the message out to their local WebSocket clients. This means:

- **No sticky sessions required** for message delivery.
- **Zero messages lost** when scaling up or down.
- **Message history** survives server restarts (stored in Redis Streams, capped at 500 messages per room).

---

## Feature Overview

| Feature | Details |
|---|---|
| Private rooms | Nanoid room codes shared out-of-band |
| Message history | Last 50 messages loaded on join (Redis Streams) |
| Image sharing | Base64 upload, zoom overlay, 2 MB client-side limit |
| Emoji picker | Full emoji-picker-react integration |
| Dark / light theme | Warm Obsidian palette with amber accents |
| Auto-reconnect | Exponential back-off with ±20% jitter |
| Error toasts | Server-side validation errors surfaced to the UI |
| Rate limiting | Token-bucket per IP, Redis-backed (60 msg/min) |
| Heartbeat | WebSocket ping/pong — dead connections terminated in 30 s |
| Horizontal scaling | Redis Pub/Sub adapter — run N replicas behind Nginx |
| Health endpoint | `GET /health` for load balancers and Docker healthchecks |
| Metrics endpoint | `GET /metrics` — room count and connection count |
| Graceful shutdown | SIGTERM drains connections and closes Redis cleanly |

---

## Tech Stack

**Backend**
- Node.js 20 (ESM)
- `ws` — WebSocket server
- `redis` v4 — Pub/Sub, Streams, Sets, rate limiting
- `express` — health and metrics HTTP endpoints
- Docker + Nginx for deployment

**Frontend**
- React 18
- Vite
- Framer Motion — all animations
- `emoji-picker-react`
- `nanoid` — room ID generation
- Tailwind CSS + custom CSS variables

---

## Getting Started

### Prerequisites

- Node.js 18+
- Redis 7 (local, Docker, or managed — see below)

### 1 — Clone and install

```bash
git clone https://github.com/your-username/echo-chat.git
cd echo-chat

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2 — Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
PORT=8080
NODE_ENV=development
REDIS_URL=redis://localhost:6379
```

For frontend, create `frontend/.env.local`:

```env
VITE_WEBSOCKET_URL=ws://localhost:8080
```

### 3 — Start Redis

**Option A — Docker (recommended)**
```bash
docker run -d --name echo_redis -p 6379:6379 redis:7-alpine
```

**Option B — Homebrew (macOS)**
```bash
brew install redis && brew services start redis
```

**Option C — Upstash (free managed Redis)**
Sign up at [upstash.com](https://upstash.com), create a database, copy the `rediss://` URL into `REDIS_URL`.

### 4 — Start servers

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Docker Compose (full stack)

Starts Redis, two backend replicas, Nginx, and serves the built frontend:

```bash
# Build frontend first
cd frontend && npm run build && cd ..

# Start the stack
docker compose up --build

# Scale to 3 backend instances
docker compose up --scale backend=3
```

Access the app at `http://localhost`.

To run with the Vite dev server instead of the built dist:

```bash
docker compose --profile dev up
```

---

## Horizontal Scaling

Because all state lives in Redis, you can run any number of backend instances behind a load balancer. The key Redis data structures:

| Structure | Key pattern | Purpose |
|---|---|---|
| Pub/Sub channel | `room:<roomId>` | Broadcast messages across instances |
| Stream | `stream:<roomId>` | Persistent message history (MAXLEN ~500) |
| Set | `room:<roomId>:members` | Active session IDs per room |
| Hash | `room:<roomId>:usernames` | sessionId → username mapping |
| String | `session:<sessionId>` | Session metadata (TTL 24h) |
| Set | `active_rooms` | Global set of active room IDs |
| String | `rl:<ip>` | Rate-limit counter (TTL = window size) |

---

## API Reference

### WebSocket messages

All messages are JSON. Send to `ws://<host>/ws` (or `ws://<host>:<port>` in dev).

**Client → Server**

| `type` | Payload | Description |
|---|---|---|
| `join` | `{ roomId, username }` | Join or switch rooms |
| `chat` | `{ roomId, username, message?, image? }` | Send text or image |
| `leave` | `{ roomId, username }` | Explicitly leave a room |
| `history` | — | Fetch last 50 messages for current room |
| `ping` | — | App-level keep-alive |

**Server → Client**

| `type` / `sender` | Fields | Description |
|---|---|---|
| `session` | `{ sessionId }` | Sent once on successful join |
| `history` | `{ messages[] }` | Last 50 messages from Redis Stream |
| `System` | `{ message, username, usersCount, timestamp }` | Join/leave notifications |
| `error` | `{ message }` | Validation or server error |
| `pong` | `{ ts }` | Response to ping |
| *(chat)* | `{ sender, sessionId, text, image, timestamp }` | Chat message |

### HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Redis connectivity check. Returns `200 ok` or `503`. |
| `GET` | `/metrics` | Active rooms and connection count. |

---

## Project Structure

```
echo-chat/
├── backend/
│   ├── server.js          # Main WS + HTTP server
│   ├── redisAdapter.js    # Pub/Sub → local WS fan-out
│   ├── rateLimiter.js     # Token-bucket rate limiter
│   ├── roomManager.js     # Redis-backed room membership
│   ├── logger.js          # Structured logger (JSON in prod)
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Full chat UI with reconnect logic
│   │   └── index.css      # Design system (CSS variables)
│   ├── Dockerfile.dev
│   └── package.json
├── nginx/
│   └── nginx.conf         # WS load balancer config
├── docker-compose.yml
└── README.md
```

---

## Edge Cases Handled

- **Reconnect on disconnect** — Exponential back-off (1 s → 30 s) with ±20% jitter to avoid thundering herd. Automatically re-joins the previous room on reconnect.
- **Duplicate messages** — Client-side deduplication on message ID during reconnect window.
- **Dead connections** — Server-side ping/pong heartbeat terminates stale sockets every 30 s.
- **Redis unavailable** — Rate limiter fails open (allows requests) so a Redis outage does not take down the chat. Pub/Sub adapter falls back to local broadcast.
- **Payload too large** — `ws` is configured with `maxPayload: 5 MB`. Images are limited to 2 MB on the client and ~3 MB on the server (base64 overhead).
- **Room mismatch** — Server validates that the `roomId` in a `chat` message matches the socket's registered room.
- **Stale sessions** — All Redis keys have TTLs; abandoned sessions are evicted automatically.
- **Empty rooms** — Room keys are deleted from Redis when the last member leaves.
- **Graceful shutdown** — SIGTERM closes all sockets and flushes Redis connections before exit.
- **Input validation** — Username length, message length, image MIME type, and room ID format are validated server-side.

---

## Deployment

### Railway / Render / Fly.io

1. Push `backend/` as a standalone service.
2. Add a Redis add-on (or Upstash) and set `REDIS_URL`.
3. Deploy `frontend/` as a static site; set `VITE_WEBSOCKET_URL=wss://your-backend-host`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP + WS listen port |
| `NODE_ENV` | `development` | `production` enables JSON logging |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `DEBUG` | — | Set to any value for debug logs |

---

## License

MIT