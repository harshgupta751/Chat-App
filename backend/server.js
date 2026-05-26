import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import express from 'express'
import http from 'http'
import dotenv from 'dotenv'
import { createClient } from 'redis'
import { createAdapter } from './redisAdapter.js'
import { RateLimiter } from './rateLimiter.js'
import { RoomManager } from './roomManager.js'
import logger from './logger.js'

dotenv.config()

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const pub  = createClient({ url: redisUrl })
const sub  = createClient({ url: redisUrl })
const main = createClient({ url: redisUrl })

async function connectRedis() {
  try {
    await Promise.all([pub.connect(), sub.connect(), main.connect()])
    logger.info('Redis connected (pub / sub / main)')
  } catch (err) {
    logger.error('Redis connection error:', err)
    process.exit(1)
  }
}

const app    = express()
const server = http.createServer(app)
const wss    = new WebSocketServer({ server, maxPayload: 5 * 1024 * 1024 })

app.use(express.json())

app.get('/health', async (req, res) => {
  try {
    await main.ping()
    res.status(200).json({ status: 'ok', redis: 'connected', ts: Date.now() })
  } catch {
    res.status(503).json({ status: 'error', redis: 'disconnected' })
  }
})

app.get('/metrics', async (req, res) => {
  try {
    const rooms     = await main.sMembers('active_rooms')
    const connCount = wss.clients.size
    const roomStats = await Promise.all(
      rooms.map(async (roomId) => ({
        roomId,
        users: await main.sCard(`room:${roomId}:members`)
      }))
    )
    res.json({ connections: connCount, rooms: roomStats })
  } catch {
    res.status(500).json({ error: 'metrics unavailable' })
  }
})

const rateLimiter = new RateLimiter(main)
const roomManager = new RoomManager(main)
const adapter     = createAdapter(sub, wss)

function safeSend(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(payload)) } catch { /* ignore */ }
  }
}

function broadcastToRoom(roomId, payload, excludeSessionId = null) {
  wss.clients.forEach(client => {
    if (
      client.readyState === client.OPEN &&
      client.roomId === roomId &&
      client.sessionId !== excludeSessionId
    ) {
      safeSend(client, payload)
    }
  })
}

async function publishToRoom(roomId, payload) {
  try {
    await pub.publish(`room:${roomId}`, JSON.stringify(payload))
  } catch (err) {
    logger.error('Redis publish error:', err)
    broadcastToRoom(roomId, payload)
  }
}

// ─────────────────────────────────────────────
//  Validators
// ─────────────────────────────────────────────
const MAX_MESSAGE_LENGTH  = 2000
const MAX_USERNAME_LENGTH = 30
const MAX_ROOM_ID_LENGTH  = 50
// Reply preview: trimmed text shown in the reply bubble (like WhatsApp)
const MAX_REPLY_PREVIEW   = 100

function validateJoin(payload) {
  if (!payload?.roomId || !payload?.username) return 'Missing roomId or username'
  if (typeof payload.roomId   !== 'string') return 'Invalid roomId'
  if (typeof payload.username !== 'string') return 'Invalid username'
  if (payload.roomId.length   > MAX_ROOM_ID_LENGTH)  return 'roomId too long'
  if (payload.username.length > MAX_USERNAME_LENGTH)  return 'Username too long'
  // Allow letters, numbers, spaces, hyphens, underscores
  if (!/^[a-zA-Z0-9_\- ]+$/.test(payload.username)) return 'Invalid username characters'
  // action must be one of the known values
  const action = payload.action || 'create'
  if (!['create', 'join', 'rejoin'].includes(action)) return 'Invalid action'
  return null
}

function validateChat(payload) {
  if (!payload?.roomId || !payload?.username) return 'Missing roomId or username'
  if (!payload.message && !payload.image)     return 'Message or image required'
  if (payload.message && typeof payload.message !== 'string') return 'Invalid message'
  if (payload.message && payload.message.length > MAX_MESSAGE_LENGTH) return 'Message too long'
  if (payload.image   && typeof payload.image   !== 'string') return 'Invalid image'
  if (payload.image   && !payload.image.startsWith('data:image/')) return 'Invalid image format'
  if (payload.image   && payload.image.length > 3 * 1024 * 1024 * 1.37) return 'Image too large'

  // Validate replyTo if present
  if (payload.replyTo !== undefined && payload.replyTo !== null) {
    const r = payload.replyTo
    if (typeof r !== 'object')                        return 'Invalid replyTo'
    if (!r.messageId || typeof r.messageId !== 'string') return 'Invalid replyTo.messageId'
    if (!r.sender    || typeof r.sender    !== 'string') return 'Invalid replyTo.sender'
    // preview is optional but must be string if present
    if (r.preview !== undefined && typeof r.preview !== 'string') return 'Invalid replyTo.preview'
    // sessionId in replyTo identifies WHICH "Harsh" was replied to
    if (r.sessionId !== undefined && typeof r.sessionId !== 'string') return 'Invalid replyTo.sessionId'
  }

  return null
}

// ─────────────────────────────────────────────
//  WebSocket connection handler
// ─────────────────────────────────────────────
wss.on('connection', async (ws, req) => {
  ws.sessionId = uuidv4()
  ws.roomId    = null
  ws.username  = null
  ws.isAlive   = true

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.socket.remoteAddress
                || 'unknown'

  logger.info(`WS connected  sessionId=${ws.sessionId} ip=${clientIp}`)

  ws.on('pong', () => { ws.isAlive = true })

  ws.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return safeSend(ws, { type: 'error', message: 'Invalid JSON' })
    }

    if (!msg?.type) return safeSend(ws, { type: 'error', message: 'Missing type' })

    const limited = await rateLimiter.isLimited(clientIp)
    if (limited) {
      return safeSend(ws, { type: 'error', message: 'Rate limit exceeded. Slow down.' })
    }

    // ── JOIN ──────────────────────────────────────────────────
    if (msg.type === 'join') {
      const err = validateJoin(msg.payload)
      if (err) return safeSend(ws, { type: 'error', message: err })

      const { roomId, username, action = 'create' } = msg.payload

      // ── Room existence enforcement ──────────────────────────
      // 'create'  → register room (nanoid-generated, from our own UI)
      // 'join'    → must already exist in active_rooms
      // 'rejoin'  → restore from sessionStorage/reconnect — allow even if
      //             room temporarily has 0 members (server restarted)
      if (action === 'join') {
        const exists = await main.sIsMember('active_rooms', roomId)
        if (!exists) {
          return safeSend(ws, {
            type:    'error',
            code:    'ROOM_NOT_FOUND',
            message: 'Room not found. Check the code and try again.'
          })
        }
      }

      if (ws.roomId && ws.roomId !== roomId) {
        await handleLeave(ws, ws.roomId, ws.username, false)
      }

      ws.roomId   = roomId
      ws.username = username.trim()

      // Store session with sessionId — this is how we distinguish two users
      // with the same display name (e.g. two people both named "Harsh")
      await main.setEx(
        `session:${ws.sessionId}`,
        86400,
        JSON.stringify({
          roomId,
          username: ws.username,
          ip:       clientIp,
          joinedAt: Date.now()
        })
      )

      await roomManager.addMember(roomId, ws.sessionId, ws.username)

      const usersCount = await roomManager.getMemberCount(roomId)

      // Send session info back — client stores this to identify own messages
      // and to correctly label replies ("You" vs the actual username)
      safeSend(ws, { type: 'session', sessionId: ws.sessionId })

      await publishToRoom(roomId, {
        sender:     'System',
        message:    'join',
        username:   ws.username,
        // sessionId on system events lets the client distinguish which "Harsh" joined
        sessionId:  ws.sessionId,
        timestamp:  new Date(),
        usersCount
      })

      logger.info(`JOIN  sessionId=${ws.sessionId} user=${ws.username} room=${roomId}`)
    }

    // ── CHAT ──────────────────────────────────────────────────
    else if (msg.type === 'chat') {
      const err = validateChat(msg.payload)
      if (err) return safeSend(ws, { type: 'error', message: err })

      if (!ws.roomId) return safeSend(ws, { type: 'error', message: 'Not in a room' })

      const { roomId, username, message, image, replyTo } = msg.payload

      if (roomId !== ws.roomId) {
        return safeSend(ws, { type: 'error', message: 'Room mismatch' })
      }

      // Build sanitised replyTo — we re-validate server-side and trim the preview
      // so a malicious client cannot inject a fake long preview or spoof a sender
      let sanitisedReplyTo = null
      if (replyTo) {
        sanitisedReplyTo = {
          messageId: replyTo.messageId,
          sender:    replyTo.sender,
          // sessionId lets the receiver know if the replied-to message was theirs
          sessionId: replyTo.sessionId || null,
          preview:   replyTo.preview
            ? replyTo.preview.slice(0, MAX_REPLY_PREVIEW)
            : null,
          // isImage flag so UI can show "📷 Photo" instead of blank preview
          isImage:   replyTo.isImage === true
        }
      }

      const messageId = uuidv4()   // stable unique ID for this message

      const payload = {
        messageId,                 // used by reply system to reference this message
        sender:    ws.username,    // always use server-verified username, not client's
        sessionId: ws.sessionId,   // disambiguates two users with the same name
        text:      message || null,
        image:     image   || null,
        replyTo:   sanitisedReplyTo,
        timestamp: new Date()
      }

      // Persist to Redis Stream (capped at 500 messages per room)
      try {
        await main.xAdd(
          `stream:${roomId}`,
          '*',
          { data: JSON.stringify(payload) },
          { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 500 } }
        )
      } catch (err) {
        logger.error('Stream write error:', err)
      }

      await publishToRoom(roomId, payload)
    }

    // ── LEAVE ─────────────────────────────────────────────────
    else if (msg.type === 'leave') {
      if (!ws.roomId) return
      await handleLeave(ws, ws.roomId, ws.username, true)
      ws.roomId   = null
      ws.username = null
    }

    // ── HISTORY ───────────────────────────────────────────────
    else if (msg.type === 'history') {
      if (!ws.roomId) return safeSend(ws, { type: 'error', message: 'Not in a room' })
      try {
        const entries = await main.xRevRange(
          `stream:${ws.roomId}`, '+', '-', { COUNT: 50 }
        )
        const history = entries
          .reverse()
          .map(e => JSON.parse(e.message.data))
        safeSend(ws, { type: 'history', messages: history })
      } catch (err) {
        logger.error('History fetch error:', err)
        safeSend(ws, { type: 'error', message: 'Could not fetch history' })
      }
    }

    // ── PING ──────────────────────────────────────────────────
    else if (msg.type === 'ping') {
      safeSend(ws, { type: 'pong', ts: Date.now() })
    }

    else {
      safeSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` })
    }
  })

  ws.on('close', async () => {
    logger.info(`WS closed  sessionId=${ws.sessionId} user=${ws.username} room=${ws.roomId}`)
    if (ws.roomId && ws.username) {
      await handleLeave(ws, ws.roomId, ws.username, false)
    }
    await main.del(`session:${ws.sessionId}`).catch(() => {})
  })

  ws.on('error', (err) => {
    logger.error(`WS error  sessionId=${ws.sessionId}:`, err.message)
  })
})

async function handleLeave(ws, roomId, username, explicit) {
  try {
    await roomManager.removeMember(roomId, ws.sessionId)
    const usersCount = await roomManager.getMemberCount(roomId)

    await publishToRoom(roomId, {
      sender:    'System',
      message:   'leave',
      username,
      sessionId: ws.sessionId,
      timestamp: new Date(),
      usersCount
    })

    logger.info(`LEAVE sessionId=${ws.sessionId} user=${username} room=${roomId} explicit=${explicit}`)
  } catch (err) {
    logger.error('handleLeave error:', err)
  }
}

// ── Heartbeat ─────────────────────────────────────────────────
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      logger.info(`Terminating dead connection  sessionId=${ws.sessionId}`)
      return ws.terminate()
    }
    ws.isAlive = false
    ws.ping()
  })
}, 30_000)

wss.on('close', () => clearInterval(heartbeatInterval))

adapter.on('message', ({ roomId, payload }) => {
  broadcastToRoom(roomId, payload)
})

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`)
  clearInterval(heartbeatInterval)
  wss.clients.forEach(ws => ws.terminate())
  server.close(async () => {
    try {
      await Promise.all([pub.quit(), sub.quit(), main.quit()])
      logger.info('Redis connections closed')
    } catch (err) {
      logger.error('Error closing Redis:', err)
    }
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('uncaughtException',  (err)    => { logger.error('Uncaught exception:', err);  shutdown('uncaughtException') })
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection:', reason) })

const PORT = process.env.PORT || 8080

async function start() {
  await connectRedis()
  server.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
}

start()