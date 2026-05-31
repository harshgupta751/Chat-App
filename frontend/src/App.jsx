import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Send, Wifi, WifiOff, Moon, Sun,
  Smile, ImageIcon, LogOut, Copy, Check, ArrowLeft, Hash,
  AlertCircle, History, RefreshCw, CornerUpLeft, X, Image as ImageIcon2
} from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import { motion, AnimatePresence } from 'framer-motion'

/* ============================================================
   ANIMATION VARIANTS
   ============================================================ */
const springSnappy = { type: 'spring', stiffness: 420, damping: 32 }
const springBouncy = { type: 'spring', stiffness: 360, damping: 26 }
const springGentle = { type: 'spring', stiffness: 280, damping: 28 }
const ease         = { duration: 0.18, ease: [0.4, 0, 0.2, 1] }

const cardVariants = {
  hidden:  { opacity: 0, y: 32, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { ...springGentle, delay: 0.05 } },
}
const formFieldVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { ...springSnappy, delay: 0.12 + i * 0.07 } }),
}
const ownBubbleVariants   = { hidden: { opacity: 0, x: 22,  scale: 0.95 }, visible: { opacity: 1, x: 0, scale: 1, transition: springSnappy } }
const otherBubbleVariants = { hidden: { opacity: 0, x: -22, scale: 0.95 }, visible: { opacity: 1, x: 0, scale: 1, transition: springSnappy } }
const systemMsgVariants   = { hidden: { opacity: 0, scale: 0.88 }, visible: { opacity: 1, scale: 1, transition: { ...ease, duration: 0.22 } } }
const emojiPickerVariants = {
  hidden:  { opacity: 0, scale: 0.88, y: 10 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: springBouncy },
  exit:    { opacity: 0, scale: 0.9,  y: 8,  transition: { ...ease, duration: 0.14 } },
}
const overlayVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
}
const zoomImgVariants = {
  hidden:  { opacity: 0, scale: 0.82 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
  exit:    { opacity: 0, scale: 0.88, transition: { duration: 0.15 } },
}
const toastVariants = {
  hidden:  { opacity: 0, y: 16, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1,    transition: springSnappy },
  exit:    { opacity: 0, y: 10, scale: 0.95, transition: ease },
}
const emptyVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 12 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: { ...springGentle, delay: 0.1 } },
}
const replyBarVariants = {
  hidden:  { opacity: 0, y: 8, height: 0 },
  visible: { opacity: 1, y: 0, height: 'auto', transition: springSnappy },
  exit:    { opacity: 0, y: 4, height: 0,      transition: { ...ease, duration: 0.15 } },
}

/* ============================================================
   RECONNECT CONFIG
   ============================================================ */
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS  = 30_000
const RECONNECT_JITTER  = 0.2

function getReconnectDelay(attempt) {
  const base   = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
  const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1)
  return Math.round(base + jitter)
}

/* ============================================================
   REPLY PREVIEW COMPONENT
   Shown inside a bubble when that message is a reply.
   Uses sessionId (not username) to safely label "You" even
   when two users share the same display name.
   ============================================================ */
function ReplyPreview({ replyTo, mySessionId, isOwnBubble }) {
  if (!replyTo) return null

  // "You" only when the sessionId of the replied-to message matches ours
  const repliedToSelf = replyTo.sessionId === mySessionId
  const label = repliedToSelf ? 'You' : replyTo.sender

  return (
    <div className={`reply-preview ${isOwnBubble ? 'reply-preview--own' : 'reply-preview--other'}`}>
      <div className="reply-preview-bar" />
      <div className="reply-preview-content">
        <span className="reply-preview-name">{label}</span>
        {replyTo.isImage
          ? <span className="reply-preview-text reply-preview-image-hint">
              <ImageIcon2 size={11} style={{ display:'inline', marginRight:3, verticalAlign:'middle' }} />
              Photo
            </span>
          : <span className="reply-preview-text">{replyTo.preview || '…'}</span>
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  sessionStorage keys — persist room across refresh
// ─────────────────────────────────────────────
const SS_USERNAME = 'echo_username'
const SS_ROOMID   = 'echo_roomId'

function loadSession() {
  try {
    const u = sessionStorage.getItem(SS_USERNAME)
    const r = sessionStorage.getItem(SS_ROOMID)
    if (u && r) return { username: u, roomId: r }
  } catch { /* sessionStorage blocked (private mode edge case) */ }
  return null
}

function saveSession(username, roomId) {
  try {
    sessionStorage.setItem(SS_USERNAME, username)
    sessionStorage.setItem(SS_ROOMID,   roomId)
  } catch { /* ignore */ }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SS_USERNAME)
    sessionStorage.removeItem(SS_ROOMID)
  } catch { /* ignore */ }
}

/* ============================================================
   APP
   ============================================================ */
function App() {
  // Restore from sessionStorage so refresh keeps you in the room
  const savedSession = loadSession()

  const [username, setUsername]                 = useState(savedSession?.username || "")
  const [roomId, setRoomId]                     = useState(savedSession?.roomId   || "")
  const [connected, setConnected]               = useState(false)
  // Start as joined if we have a saved session — WS onopen will re-join
  const [joined, setJoined]                     = useState(!!savedSession)
  const [usersCount, setUsersCount]             = useState(0)
  const [messages, setMessages]                 = useState([])
  const messagesEndRef                          = useRef()
  const [message, setMessage]                   = useState("")
  const wsRef                                   = useRef(null)
  const [darkMode, setDarkMode]                 = useState(true)
  const usernameRef                             = useRef(username)
  const [mySessionId, setMySessionId]           = useState(null)
  const mySessionIdRef                          = useRef(null)
  const [showEmojiPicker, setShowEmojiPicker]   = useState(false)
  const emojiPickerRef                          = useRef()
  const [zoomImage, setZoomImage]               = useState(null)
  const [imageUploading, setImageUploading]     = useState(false)
  const [showJoinExisting, setShowJoinExisting] = useState(false)
  const [copied, setCopied]                     = useState(false)
  const [errorToast, setErrorToast]             = useState(null)
  const [reconnecting, setReconnecting]         = useState(false)
  // Inline error shown inside the join card (e.g. room not found)
  const [roomError, setRoomError]               = useState(null)

  // ── Reply state ────────────────────────────────────────────
  const [replyingTo, setReplyingTo]             = useState(null)
  const inputRef                                = useRef()

  // Stable refs
  const joinedRef        = useRef(joined)
  const roomIdRef        = useRef(roomId)
  const reconnectTimer   = useRef(null)
  const reconnectAttempt = useRef(0)
  const intentionalClose = useRef(false)
  // Set once at mount — true if page was refreshed while inside a room
  const isRejoinRef      = useRef(!!savedSession)

  useEffect(() => { joinedRef.current   = joined   }, [joined])
  useEffect(() => { roomIdRef.current   = roomId   }, [roomId])
  useEffect(() => { usernameRef.current = username }, [username])

  // ── Error toast ────────────────────────────────────────────
  const showError = useCallback((msg, durationMs = 4000) => {
    setErrorToast(msg)
    setTimeout(() => setErrorToast(null), durationMs)
  }, [])

  // ── WebSocket factory ──────────────────────────────────────
  const createSocket = useCallback(() => {
    const socket = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL)
    wsRef.current = socket

    socket.onopen = () => {
      setConnected(true)
      setReconnecting(false)
      reconnectAttempt.current = 0

      if (joinedRef.current && roomIdRef.current && usernameRef.current) {
        socket.send(JSON.stringify({
          type:    'join',
          payload: { roomId: roomIdRef.current, username: usernameRef.current, action: 'rejoin' }
        }))
        // History is requested inside 'session' handler — no setTimeout race
      }
    }

    socket.onmessage = (e) => {
      let parsed
      try { parsed = JSON.parse(e.data) } catch { return }

      if (parsed.type === 'error') {
        setImageUploading(false)
        if (parsed.code === 'ROOM_NOT_FOUND') {
          setRoomError('Room not found. Check the code and try again.')
          setJoined(false)
          clearSession()
          isRejoinRef.current = false
        } else if (parsed.code === 'NOT_IN_ROOM' || parsed.code === 'HISTORY_ERROR') {
          // Silent — these are internal race-condition artifacts, not user-facing errors
          return
        } else if (!joinedRef.current) {
          // On join screen — suppress any other server noise
          return
        } else {
          showError(parsed.message || 'Server error')
        }
        return
      }

      if (parsed.type === 'session') {
        mySessionIdRef.current = parsed.sessionId
        setMySessionId(parsed.sessionId)
        saveSession(usernameRef.current, roomIdRef.current)
        setJoined(true)
        if (!isRejoinRef.current) setMessages([])
        isRejoinRef.current = true
        // Request history HERE — guaranteed join is complete on server
        // Eliminates the 300ms setTimeout race condition
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: 'history' }))
        return
      }

      if (parsed.type === 'pong') return

      if (parsed.type === 'history') {
        const historyMsgs = parsed.messages.map(m => ({
          id:        m.messageId || uuidv4(),
          messageId: m.messageId || uuidv4(),
          isOwn:     m.sessionId === mySessionIdRef.current,
          sender:    m.sender,
          sessionId: m.sessionId,
          text:      m.text  || null,
          image:     m.image || null,
          replyTo:   m.replyTo || null,
          timestamp: new Date(m.timestamp),
          isHistory: true
        }))
        setMessages(historyMsgs)
        return
      }

      if (parsed.sender === 'System') {
        setUsersCount(parsed.usersCount)
        // Use sessionId to identify which exact user joined/left —
        // important when two users share the same display name
        if (parsed.message === 'join' && parsed.sessionId !== mySessionIdRef.current) {
          setMessages(prev => [...prev, {
            id:        uuidv4(),
            messageId: uuidv4(),
            isOwn:     false,
            sender:    'System',
            text:      `${parsed.username} joined the room`,
            timestamp: new Date(parsed.timestamp)
          }])
        }
        if (parsed.message === 'leave' && parsed.sessionId !== mySessionIdRef.current) {
          setMessages(prev => [...prev, {
            id:        uuidv4(),
            messageId: uuidv4(),
            isOwn:     false,
            sender:    'System',
            text:      `${parsed.username} left the room`,
            timestamp: new Date(parsed.timestamp)
          }])
        }
        return
      }

      // Chat message — deduplicate on messageId
      setMessages(prev => {
        const exists = prev.some(m => m.messageId === parsed.messageId)
        if (exists) return prev
        return [...prev, {
          id:        parsed.messageId || uuidv4(),
          messageId: parsed.messageId,
          isOwn:     parsed.sessionId === mySessionIdRef.current,
          sender:    parsed.sender,
          sessionId: parsed.sessionId,
          text:      parsed.text  || null,
          image:     parsed.image || null,
          replyTo:   parsed.replyTo || null,
          timestamp: new Date(parsed.timestamp)
        }]
      })
      setImageUploading(false)
    }

    socket.onclose = () => {
      setConnected(false)
      if (intentionalClose.current) { intentionalClose.current = false; return }
      setReconnecting(true)
      const delay = getReconnectDelay(reconnectAttempt.current)
      reconnectAttempt.current++
      reconnectTimer.current = setTimeout(() => createSocket(), delay)
    }

    socket.onerror = () => { /* onclose fires after onerror */ }
    return socket
  }, [showError])

  useEffect(() => {
    createSocket()
    return () => {
      intentionalClose.current = true
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target))
        setShowEmojiPicker(false)
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  // App-level ping keep-alive
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }, 25_000)
    return () => clearInterval(id)
  }, [])

  // ── Helpers ────────────────────────────────────────────────
  function wrapEmojis(text) {
    return text.replace(
      /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/gu,
      emoji => `<span class="emoji">${emoji}</span>`
    )
  }

  function safeSend(payload) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    } else {
      showError('Not connected — message not sent')
    }
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && message.trim() && connected) sendMessage()
    if (e.key === 'Escape') setReplyingTo(null)
  }

  // ── Reply: triggered by swipe-icon on a bubble ─────────────
  function startReply(msg) {
    setReplyingTo({
      messageId: msg.messageId,
      sender:    msg.sender,
      sessionId: msg.sessionId,  // key: identifies WHICH user, not just the name
      preview:   msg.text ? msg.text.slice(0, 100) : null,
      isImage:   !!msg.image && !msg.text
    })
    // Focus input so user can start typing immediately
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function cancelReply() { setReplyingTo(null) }

  // ── Room actions ───────────────────────────────────────────
  function createRoom() {
    const id = nanoid(10)
    setRoomId(id)
    roomIdRef.current = id
    safeSend({ type: 'join', payload: { roomId: id, username: username.trim(), action: 'create' } })
    setJoined(true)
    setMessages([])
  }

  function joinExistingRoom() {
    setRoomError(null)
    safeSend({ type: 'join', payload: { roomId: roomId.trim(), username: username.trim(), action: 'join' } })
  }

  function leaveRoom() {
    safeSend({ type: 'leave', payload: { roomId, username } })
    clearSession()
    setJoined(false)
    setUsername("")
    setRoomId("")
    setMessages([])
    setUsersCount(0)
    setReplyingTo(null)
  }

  function sendMessage() {
    if (!message.trim()) return
    safeSend({
      type: 'chat',
      payload: {
        message:  message.trim(),
        roomId,
        username,
        // Include full replyTo object — server sanitises it
        replyTo:  replyingTo || null
      }
    })
    setMessage("")
    setReplyingTo(null)
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function onEmojiClick(emojiData) {
    setMessage(prev => prev + emojiData.emoji)
  }

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file || !connected) return
    e.target.value = null

    if (!file.type.startsWith('image/')) { showError('Only image files are supported'); return }
    if (file.size > 2 * 1024 * 1024)    { showError('Image too large — max 2 MB');      return }

    setImageUploading(true)
    const reader = new FileReader()
    reader.onloadend = () => {
      safeSend({
        type: 'chat',
        payload: {
          image:   reader.result,
          roomId,
          username,
          replyTo: replyingTo || null
        }
      })
      setReplyingTo(null)
    }
    reader.onerror = () => { setImageUploading(false); showError('Could not read image file') }
    reader.readAsDataURL(file)
  }

  const rootCls = `app-root${darkMode ? '' : ' light'}`

  /* ============================================================
     JOIN SCREEN
     ============================================================ */
  if (!joined) {
    return (
      <div className={rootCls}>
        <div className="join-screen">
          <div className="join-glow" />

          <motion.button className="theme-toggle-fixed" onClick={() => setDarkMode(d => !d)}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} aria-label="Toggle theme">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={darkMode ? 'sun' : 'moon'}
                initial={{ opacity: 0, rotate: -40, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 40, scale: 0.6 }} transition={{ duration: 0.18 }} style={{ display: 'flex' }}>
                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          <motion.div className="join-card" variants={cardVariants} initial="hidden" animate="visible">
            <motion.div className="join-brand" custom={0} variants={formFieldVariants} initial="hidden" animate="visible">
              <motion.div className="join-logo-mark" whileHover={{ scale: 1.07, rotate: -4 }} transition={springSnappy}>E</motion.div>
              <div>
                <div className="join-app-name">
                  <AnimatePresence mode="wait">
                    <motion.span key={showJoinExisting ? 'join' : 'echo'}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }} transition={ease} style={{ display: 'block' }}>
                      {showJoinExisting ? 'Join a Room' : 'Echo'}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <div className="join-tagline">
                  <AnimatePresence mode="wait">
                    <motion.span key={showJoinExisting ? 'sub-join' : 'sub-create'}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }} style={{ display: 'block' }}>
                      {showJoinExisting ? 'Enter a room code to connect' : 'Private rooms. Real conversations.'}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <motion.div className="join-sep" custom={1} variants={formFieldVariants} initial="hidden" animate="visible" />

            <div className="join-form">
              <motion.div className="form-field" custom={2} variants={formFieldVariants} initial="hidden" animate="visible">
                <label className="form-label">Display name</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && username.trim() && connected && !showJoinExisting) createRoom() }}
                  placeholder="Who are you?" className="form-input" maxLength={30} />
              </motion.div>

              <AnimatePresence>
                {showJoinExisting && (
                  <motion.div className="form-field"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} transition={{ ...springSnappy, duration: 0.22 }} style={{ overflow: 'hidden' }}>
                    <div style={{ paddingTop: '4px' }}>
                      <label className="form-label">Room code</label>
                      <div className="form-input-wrap" style={{ marginTop: '7px' }}>
                        <span className="form-input-icon"><Hash size={13} /></span>
                        <input type="text" value={roomId} onChange={e => { setRoomId(e.target.value); setRoomError(null) }}
                          onKeyDown={e => { if (e.key === 'Enter' && username.trim() && roomId.trim() && connected) joinExistingRoom() }}
                          placeholder="Paste room code here"
                          className={`form-input form-input--icon${roomError ? ' form-input--error' : ''}`}
                          maxLength={50} />
                      </div>
                      {/* Inline error — shown only when room not found */}
                      <AnimatePresence>
                        {roomError && (
                          <motion.div className="room-error"
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                            <AlertCircle size={12} />
                            <span>{roomError}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div custom={3} variants={formFieldVariants} initial="hidden" animate="visible">
                <AnimatePresence mode="wait">
                  {!showJoinExisting ? (
                    <motion.div key="create-btns" className="form-actions"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={ease}>
                      <motion.button className="btn btn-primary" onClick={createRoom}
                        disabled={!username.trim() || !connected}
                        whileHover={username.trim() && connected ? { scale: 1.02, y: -1 } : {}}
                        whileTap={username.trim() && connected ? { scale: 0.97 } : {}} transition={springSnappy}>
                        Create new room
                      </motion.button>
                      <motion.button className="btn btn-outline"
                        onClick={() => { setShowJoinExisting(true); setRoomId("") }}
                        disabled={!username.trim() || !connected}
                        whileHover={username.trim() && connected ? { scale: 1.01 } : {}}
                        whileTap={username.trim() && connected ? { scale: 0.97 } : {}} transition={springSnappy}>
                        Join existing room
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.div key="join-btns" className="form-actions"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={ease}>
                      <motion.button className="btn btn-primary" onClick={joinExistingRoom}
                        disabled={!roomId.trim() || !username.trim() || !connected}
                        whileHover={roomId.trim() && username.trim() && connected ? { scale: 1.02, y: -1 } : {}}
                        whileTap={roomId.trim() && username.trim() && connected ? { scale: 0.97 } : {}} transition={springSnappy}>
                        Join room
                      </motion.button>
                      <motion.button className="btn btn-ghost"
                        onClick={() => { setShowJoinExisting(false); setRoomId("") }}
                        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} transition={springSnappy}>
                        <ArrowLeft size={14} />Back
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            <motion.div className="join-status-row" custom={4} variants={formFieldVariants} initial="hidden" animate="visible">
              <motion.div className={`pulse-dot ${connected ? 'pulse-dot--on' : 'pulse-dot--off'}`}
                animate={connected ? { boxShadow: ['0 0 0px rgba(74,222,128,0.4)', '0 0 8px rgba(74,222,128,0.7)', '0 0 0px rgba(74,222,128,0.4)'] } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }} />
              <span className="join-status-text">
                {reconnecting ? 'Reconnecting…' : connected ? 'Connected to server' : 'Disconnected'}
              </span>
              {reconnecting && (
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'flex', marginLeft: 4 }}>
                  <RefreshCw size={12} style={{ color: 'var(--accent)' }} />
                </motion.span>
              )}
            </motion.div>
          </motion.div>

          <motion.div className="join-credit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.4 }}>
            Built by Harsh Gupta
          </motion.div>
        </div>

        <AnimatePresence>
          {errorToast && (
            <motion.div className="error-toast" variants={toastVariants} initial="hidden" animate="visible" exit="exit">
              <AlertCircle size={14} /><span>{errorToast}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  /* ============================================================
     CHAT SCREEN
     ============================================================ */
  return (
    <div className={rootCls}>
      <div className="chat-root">

        {/* ── Header ── */}
        <motion.header className="chat-header"
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSnappy, delay: 0.04 }}>
          <div className="chat-header-left">
            <motion.div className="chat-logo-sm" whileHover={{ scale: 1.1, rotate: -4 }} transition={springSnappy}>E</motion.div>
            <div className="chat-room-meta">
              <div className="chat-room-row">
                <span className="chat-room-tag">ROOM</span>
                <code className="chat-room-id">{roomId}</code>
                <motion.button className="copy-pill" onClick={copyRoomId}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} transition={springSnappy}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied ? 'check' : 'copy'}
                      initial={{ opacity: 0, scale: 0.5, rotate: -20 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: 20 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                    </motion.span>
                  </AnimatePresence>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied ? 'copied-txt' : 'copy-txt'}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.13 }}>
                      {copied ? 'Copied' : 'Copy'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
              <div className="chat-user-line">Signed in as <strong>{username}</strong></div>
            </div>
          </div>

          <div className="chat-header-right">
            {reconnecting && (
              <motion.div className="reconnect-badge" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'flex' }}>
                  <RefreshCw size={11} />
                </motion.span>
                <span>Reconnecting</span>
              </motion.div>
            )}
            <div className="online-count">
              <motion.div className="online-dot"
                animate={{ boxShadow: ['0 0 0px rgba(74,222,128,0.4)', '0 0 7px rgba(74,222,128,0.7)', '0 0 0px rgba(74,222,128,0.4)'] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }} />
              <span>{usersCount > 0 ? usersCount - 1 : 0} online</span>
            </div>
            <div className="h-sep" />
            <div className={`conn-badge ${connected ? 'on' : 'off'}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{connected ? 'Live' : 'Offline'}</span>
            </div>
            <motion.button className="icon-btn" onClick={() => setDarkMode(d => !d)}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} aria-label="Toggle theme">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={darkMode ? 'sun' : 'moon'}
                  initial={{ opacity: 0, rotate: -40, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 40, scale: 0.6 }} transition={{ duration: 0.16 }} style={{ display: 'flex' }}>
                  {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button className="leave-btn" onClick={leaveRoom}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} transition={springSnappy}>
              <LogOut size={13} /><span>Leave</span>
            </motion.button>
          </div>
        </motion.header>

        {/* ── Messages ── */}
        <main className="chat-messages">
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div className="chat-empty" variants={emptyVariants} initial="hidden" animate="visible"
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}>
                <div className="chat-empty-rings">
                  <motion.div className="ring ring-1" animate={{ scale: [1, 1.18, 1] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }} />
                  <motion.div className="ring ring-2" animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: 0.2 }} />
                  <motion.div className="ring ring-3" animate={{ scale: [1, 1.07, 1], opacity: [0.25, 0.5, 0.25] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: 0.4 }} />
                </div>
                <p className="chat-empty-title">Room is quiet</p>
                <p className="chat-empty-sub">Send the first message to get started</p>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length > 0 && (
            <div className="messages-list">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const prevIsHistory = idx > 0 && messages[idx - 1].isHistory
                  const showDivider   = prevIsHistory && !msg.isHistory

                  if (msg.sender === 'System') {
                    return (
                      <motion.div key={msg.id} className="msg-system" variants={systemMsgVariants} initial="hidden" animate="visible">
                        <span>{msg.text}</span>
                      </motion.div>
                    )
                  }

                  const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(msg.text || '')

                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="history-divider">
                          <History size={10} /><span>Earlier messages</span>
                        </div>
                      )}

                      {/* ── Message row with reply button ── */}
                      <div className={`msg-row-outer ${msg.isOwn ? 'msg-row-outer--own' : 'msg-row-outer--other'}`}>

                        {/* Reply button — left side for own messages */}
                        {msg.isOwn && (
                          <motion.button
                            className="reply-btn reply-btn--left"
                            onClick={() => startReply(msg)}
                            whileHover={{ scale: 1.15, opacity: 1 }}
                            whileTap={{ scale: 0.9 }}
                            aria-label="Reply"
                          >
                            <CornerUpLeft size={13} />
                          </motion.button>
                        )}

                        <motion.div
                          className={`msg-row ${msg.isOwn ? 'msg-row--own' : 'msg-row--other'}`}
                          variants={msg.isHistory ? systemMsgVariants : (msg.isOwn ? ownBubbleVariants : otherBubbleVariants)}
                          initial="hidden" animate="visible" layout>
                          <motion.div
                            className={`msg-bubble ${msg.isOwn ? 'msg-bubble--own' : 'msg-bubble--other'} ${msg.isHistory ? 'msg-bubble--history' : ''} ${msg.replyTo ? 'msg-bubble--has-reply' : ''}`}
                            whileHover={{ scale: 1.012 }} transition={{ duration: 0.14 }}>

                            {/* Sender name — shown for others' messages */}
                            {!msg.isOwn && (
                              <div className="msg-sender">{msg.sender}</div>
                            )}

                            {/* Reply preview — WhatsApp style */}
                            {msg.replyTo && (
                              <ReplyPreview
                                replyTo={msg.replyTo}
                                mySessionId={mySessionId}
                                isOwnBubble={msg.isOwn}
                              />
                            )}

                            {msg.image && (
                              <motion.img src={msg.image} alt="Shared image" className="msg-img"
                                onClick={() => setZoomImage(msg.image)}
                                initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                                transition={springBouncy} whileHover={{ scale: 1.025, opacity: 0.9 }} />
                            )}

                            {msg.text && (
                              <p className={`msg-text ${isEmojiOnly ? 'msg-text--big' : 'emoji-size-fix'}`}
                                dangerouslySetInnerHTML={{ __html: isEmojiOnly ? msg.text : wrapEmojis(msg.text) }} />
                            )}

                            <div className="msg-time">
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </motion.div>
                        </motion.div>

                        {/* Reply button — right side for others' messages */}
                        {!msg.isOwn && (
                          <motion.button
                            className="reply-btn reply-btn--right"
                            onClick={() => startReply(msg)}
                            whileHover={{ scale: 1.15, opacity: 1 }}
                            whileTap={{ scale: 0.9 }}
                            aria-label="Reply"
                          >
                            <CornerUpLeft size={13} />
                          </motion.button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence>
            {imageUploading && (
              <motion.div className="upload-toast" variants={toastVariants} initial="hidden" animate="visible" exit="exit">
                <div className="spinner" /><span>Sending image</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </main>

        {/* ── Input bar ── */}
        <motion.footer className="chat-input-bar"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSnappy, delay: 0.1 }}>

          {/* Reply bar — slides in above input when replying */}
          <AnimatePresence>
            {replyingTo && (
              <motion.div className="reply-bar"
                variants={replyBarVariants} initial="hidden" animate="visible" exit="exit">
                <div className="reply-bar-line" />
                <div className="reply-bar-content">
                  <CornerUpLeft size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div className="reply-bar-text">
                    {/* Show "You" if replying to own message (matched by sessionId) */}
                    <span className="reply-bar-name">
                      {replyingTo.sessionId === mySessionId ? 'You' : replyingTo.sender}
                    </span>
                    {replyingTo.isImage
                      ? <span className="reply-bar-preview">
                          <ImageIcon2 size={11} style={{ display:'inline', marginRight:3, verticalAlign:'middle' }} />
                          Photo
                        </span>
                      : <span className="reply-bar-preview">{replyingTo.preview || '…'}</span>
                    }
                  </div>
                </div>
                <motion.button className="reply-bar-close" onClick={cancelReply}
                  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} aria-label="Cancel reply">
                  <X size={14} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="chat-input-wrap" ref={emojiPickerRef}>
            <div className="input-action-btns">
              <motion.button type="button" className="input-action"
                onClick={() => setShowEmojiPicker(p => !p)}
                whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} transition={springSnappy} aria-label="Toggle emoji picker">
                <Smile size={17} />
              </motion.button>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="img-upload" />
              <motion.label htmlFor="img-upload" className="input-action" style={{ cursor: 'pointer' }}
                whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} transition={springSnappy} aria-label="Upload image">
                <ImageIcon size={17} />
              </motion.label>
            </div>

            <input ref={inputRef} type="text" value={message}
              onChange={e => setMessage(e.target.value)} onKeyDown={handleKeyPress}
              placeholder={connected ? 'Write a message…' : 'Reconnecting…'}
              className="chat-input-field" maxLength={2000} disabled={!connected} />

            <motion.button className="send-btn" onClick={sendMessage}
              disabled={!message.trim() || !connected}
              whileHover={message.trim() && connected ? { scale: 1.1 } : {}}
              whileTap={message.trim() && connected ? { scale: 0.88 } : {}}
              transition={springBouncy} aria-label="Send message">
              <motion.span animate={message.trim() ? { x: [0, 2, 0] } : { x: 0 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }} style={{ display: 'flex' }}>
                <Send size={15} />
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div className="emoji-picker-wrap" variants={emojiPickerVariants} initial="hidden" animate="visible" exit="exit">
                  <EmojiPicker onEmojiClick={onEmojiClick} theme={darkMode ? 'dark' : 'light'} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.footer>
      </div>

      {/* ── Image zoom overlay ── */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div className="zoom-overlay" variants={overlayVariants} initial="hidden" animate="visible" exit="exit" onClick={() => setZoomImage(null)}>
            <motion.img src={zoomImage} alt="Zoomed" className="zoom-img"
              variants={zoomImgVariants} initial="hidden" animate="visible" exit="exit" onClick={e => e.stopPropagation()} />
            <motion.button className="zoom-close-btn" onClick={() => setZoomImage(null)}
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1, transition: { ...springBouncy, delay: 0.08 } }}
              exit={{ opacity: 0, scale: 0.7 }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} aria-label="Close zoom">
              &times;
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error toast ── */}
      <AnimatePresence>
        {errorToast && (
          <motion.div className="error-toast" variants={toastVariants} initial="hidden" animate="visible" exit="exit">
            <AlertCircle size={14} /><span>{errorToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App