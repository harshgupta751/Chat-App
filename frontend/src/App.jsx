import { useEffect, useRef, useState } from 'react'
import {
  Send, Wifi, WifiOff, Moon, Sun,
  Smile, ImageIcon, LogOut, Copy, Check, ArrowLeft, Hash
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
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { ...springSnappy, delay: 0.12 + i * 0.07 }
  }),
}

const ownBubbleVariants = {
  hidden:  { opacity: 0, x: 22, scale: 0.95 },
  visible: { opacity: 1, x: 0,  scale: 1, transition: springSnappy },
}

const otherBubbleVariants = {
  hidden:  { opacity: 0, x: -22, scale: 0.95 },
  visible: { opacity: 1, x: 0,   scale: 1, transition: springSnappy },
}

const systemMsgVariants = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: { ...ease, duration: 0.22 } },
}

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
  visible: { opacity: 1, y: 0,  scale: 1,   transition: springSnappy },
  exit:    { opacity: 0, y: 10, scale: 0.95, transition: ease },
}

const emptyVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 12 },
  visible: { opacity: 1, scale: 1,    y: 0,
    transition: { ...springGentle, delay: 0.1 } },
}

/* ============================================================
   APP
   ============================================================ */

function App() {
  const [username, setUsername]               = useState("")
  const [roomId, setRoomId]                   = useState("")
  const [connected, setconnected]             = useState(false)
  const [joined, setJoined]                   = useState(false)
  const [usersCount, setUsersCount]           = useState(0)
  const [messages, setMessages]               = useState([])
  const messagesEndRef                        = useRef()
  const [message, setMessage]                 = useState("")
  const [ws, setwsocket]                      = useState()
  const [darkMode, setDarkMode]               = useState(true)
  const usernameRef                           = useRef(username)
  const [mySessionId, setMySessionId]         = useState(null)
  const mySessionIdRef                        = useRef(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiPickerRef                        = useRef()
  const [zoomImage, setZoomImage]             = useState(null)
  const [imageUploading, setImageUploading]   = useState(false)
  const [showJoinExisting, setShowJoinExisting] = useState(false)
  const [copied, setCopied]                   = useState(false)

  // ── WebSocket bootstrap ─────────────────────────────────
  useEffect(() => {
    const socket = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL)
    setwsocket(socket)
    socket.onopen = () => setconnected(true)

    socket.onmessage = (e) => {
      const parsed = JSON.parse(e.data)

      if (parsed.type === 'session') {
        mySessionIdRef.current = parsed.sessionId
        setMySessionId(parsed.sessionId)
        return
      }

      if (parsed.sender === "System") {
        setUsersCount(parsed.usersCount)
        if (parsed.message === 'join' && parsed.username !== usernameRef.current) {
          setMessages(prev => [...prev, {
            id: uuidv4(), isOwn: false, sender: 'System',
            text: `${parsed.username} joined the room`,
            timestamp: new Date(parsed.timestamp)
          }])
        }
        if (parsed.message === 'leave' && parsed.username !== usernameRef.current) {
          setMessages(prev => [...prev, {
            id: uuidv4(), isOwn: false, sender: 'System',
            text: `${parsed.username} left the room`,
            timestamp: new Date(parsed.timestamp)
          }])
        }
      } else {
        setMessages(prev => [...prev, {
          id: uuidv4(),
          isOwn: parsed.sessionId === mySessionIdRef.current,
          sender: parsed.sender,
          text: parsed.text,
          image: parsed.image,
          timestamp: new Date(parsed.timestamp)
        }])
        setImageUploading(false)
      }
    }

    return () => { if (connected) socket.close() }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => { usernameRef.current = username }, [username])

  useEffect(() => {
    return () => { if (ws && ws.readyState === WebSocket.OPEN) ws.close() }
  }, [ws])

  useEffect(() => {
    const handleOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target))
        setShowEmojiPicker(false)
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  useEffect(() => () => setImageUploading(false), [])

  // ── Helpers ─────────────────────────────────────────────
  function wrapEmojis(text) {
    return text.replace(
      /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/gu,
      emoji => `<span class="emoji">${emoji}</span>`
    )
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && message && connected) sendMessage()
  }

  // ── Room actions ────────────────────────────────────────
  function createRoom() {
    const id = nanoid(10)
    setRoomId(id)
    ws.send(JSON.stringify({ type: "join", payload: { roomId: id, username } }))
    setJoined(true)
  }

  function joinExistingRoom() {
    ws.send(JSON.stringify({ type: "join", payload: { roomId, username } }))
    setJoined(true)
  }

  function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "leave", payload: { roomId, username } }))
    setJoined(false)
    setUsername("")
    setRoomId("")
    setMessages([])
  }

  function sendMessage() {
    ws.send(JSON.stringify({ type: 'chat', payload: { message, roomId, username } }))
    setMessage("")
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
    setImageUploading(true)
    const reader = new FileReader()
    reader.onloadend = () => {
      ws.send(JSON.stringify({
        type: 'chat',
        payload: { image: reader.result, roomId, username }
      }))
    }
    reader.readAsDataURL(file)
  }

  const rootCls = `app-root${darkMode ? '' : ' light'}`

  // ============================================================
  // JOIN SCREEN
  // ============================================================
  if (!joined) {
    return (
      <div className={rootCls}>
        <div className="join-screen">
          <div className="join-glow" />

          {/* Theme toggle */}
          <motion.button
            className="theme-toggle-fixed"
            onClick={() => setDarkMode(d => !d)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={darkMode ? 'sun' : 'moon'}
                initial={{ opacity: 0, rotate: -40, scale: 0.6 }}
                animate={{ opacity: 1, rotate: 0,   scale: 1 }}
                exit={{    opacity: 0, rotate:  40,  scale: 0.6 }}
                transition={{ duration: 0.18 }}
                style={{ display: 'flex' }}
              >
                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          {/* Card */}
          <motion.div
            className="join-card"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Brand */}
            <motion.div
              className="join-brand"
              custom={0}
              variants={formFieldVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="join-logo-mark"
                whileHover={{ scale: 1.07, rotate: -4 }}
                transition={springSnappy}
              >
                E
              </motion.div>
              <div>
                <div className="join-app-name">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={showJoinExisting ? 'join' : 'echo'}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{    opacity: 0, y: -6 }}
                      transition={ease}
                      style={{ display: 'block' }}
                    >
                      {showJoinExisting ? 'Join a Room' : 'Echo'}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <div className="join-tagline">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={showJoinExisting ? 'sub-join' : 'sub-create'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{    opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: 'block' }}
                    >
                      {showJoinExisting
                        ? 'Enter a room code to connect'
                        : 'Private rooms. Real conversations.'}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="join-sep"
              custom={1}
              variants={formFieldVariants}
              initial="hidden"
              animate="visible"
            />

            <div className="join-form">
              {/* Name field */}
              <motion.div
                className="form-field"
                custom={2}
                variants={formFieldVariants}
                initial="hidden"
                animate="visible"
              >
                <label className="form-label">Display name</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Who are you?"
                  className="form-input"
                />
              </motion.div>

              {/* Room ID — join existing only */}
              <AnimatePresence>
                {showJoinExisting && (
                  <motion.div
                    className="form-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{    opacity: 0, height: 0 }}
                    transition={{ ...springSnappy, duration: 0.22 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ paddingTop: '4px' }}>
                      <label className="form-label">Room code</label>
                      <div className="form-input-wrap" style={{ marginTop: '7px' }}>
                        <span className="form-input-icon">
                          <Hash size={13} />
                        </span>
                        <input
                          type="text"
                          value={roomId}
                          onChange={e => setRoomId(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && username && roomId && connected)
                              joinExistingRoom()
                          }}
                          placeholder="Paste room code here"
                          className="form-input form-input--icon"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <motion.div
                custom={3}
                variants={formFieldVariants}
                initial="hidden"
                animate="visible"
              >
                <AnimatePresence mode="wait">
                  {!showJoinExisting ? (
                    <motion.div
                      key="create-btns"
                      className="form-actions"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{    opacity: 0, y: -8 }}
                      transition={ease}
                    >
                      <motion.button
                        className="btn btn-primary"
                        onClick={createRoom}
                        disabled={!username.trim() || !connected}
                        whileHover={username.trim() && connected ? { scale: 1.02, y: -1 } : {}}
                        whileTap={username.trim() && connected ? { scale: 0.97 } : {}}
                        transition={springSnappy}
                      >
                        Create new room
                      </motion.button>
                      <motion.button
                        className="btn btn-outline"
                        onClick={() => { setShowJoinExisting(true); setRoomId("") }}
                        disabled={!username.trim() || !connected}
                        whileHover={username.trim() && connected ? { scale: 1.01 } : {}}
                        whileTap={username.trim() && connected ? { scale: 0.97 } : {}}
                        transition={springSnappy}
                      >
                        Join existing room
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="join-btns"
                      className="form-actions"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{    opacity: 0, y: -8 }}
                      transition={ease}
                    >
                      <motion.button
                        className="btn btn-primary"
                        onClick={joinExistingRoom}
                        disabled={!roomId.trim() || !username.trim() || !connected}
                        whileHover={roomId.trim() && username.trim() && connected ? { scale: 1.02, y: -1 } : {}}
                        whileTap={roomId.trim() && username.trim() && connected ? { scale: 0.97 } : {}}
                        transition={springSnappy}
                      >
                        Join room
                      </motion.button>
                      <motion.button
                        className="btn btn-ghost"
                        onClick={() => { setShowJoinExisting(false); setRoomId("") }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.97 }}
                        transition={springSnappy}
                      >
                        <ArrowLeft size={14} />
                        Back
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Connection status */}
            <motion.div
              className="join-status-row"
              custom={4}
              variants={formFieldVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className={`pulse-dot ${connected ? 'pulse-dot--on' : 'pulse-dot--off'}`}
                animate={connected ? {
                  boxShadow: [
                    '0 0 0px rgba(74,222,128,0.4)',
                    '0 0 8px rgba(74,222,128,0.7)',
                    '0 0 0px rgba(74,222,128,0.4)',
                  ]
                } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
              <span className="join-status-text">
                {connected ? 'Connected to server' : 'Disconnected'}
              </span>
            </motion.div>
          </motion.div>

          <motion.div
            className="join-credit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            Built by Harsh Gupta
          </motion.div>
        </div>
      </div>
    )
  }

  // ============================================================
  // CHAT SCREEN
  // ============================================================
  return (
    <div className={rootCls}>
      <div className="chat-root">

        {/* ── Header ── */}
        <motion.header
          className="chat-header"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSnappy, delay: 0.04 }}
        >
          <div className="chat-header-left">
            <motion.div
              className="chat-logo-sm"
              whileHover={{ scale: 1.1, rotate: -4 }}
              transition={springSnappy}
            >
              E
            </motion.div>

            <div className="chat-room-meta">
              <div className="chat-room-row">
                <span className="chat-room-tag">ROOM</span>
                <code className="chat-room-id">{roomId}</code>

                <motion.button
                  className="copy-pill"
                  onClick={copyRoomId}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.93 }}
                  transition={springSnappy}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'check' : 'copy'}
                      initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                      animate={{ opacity: 1, scale: 1,   rotate: 0 }}
                      exit={{    opacity: 0, scale: 0.5,  rotate: 20 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: 'flex' }}
                    >
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                    </motion.span>
                  </AnimatePresence>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'copied-txt' : 'copy-txt'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{    opacity: 0, y: -4 }}
                      transition={{ duration: 0.13 }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
              <div className="chat-user-line">
                Signed in as <strong>{username}</strong>
              </div>
            </div>
          </div>

          <div className="chat-header-right">
            <div className="online-count">
              <motion.div
                className="online-dot"
                animate={{
                  boxShadow: [
                    '0 0 0px rgba(74,222,128,0.4)',
                    '0 0 7px rgba(74,222,128,0.7)',
                    '0 0 0px rgba(74,222,128,0.4)',
                  ]
                }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              />
              <span>{usersCount > 0 ? usersCount - 1 : 0} online</span>
            </div>

            <div className="h-sep" />

            <div className={`conn-badge ${connected ? 'on' : 'off'}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{connected ? 'Live' : 'Offline'}</span>
            </div>

            <motion.button
              className="icon-btn"
              onClick={() => setDarkMode(d => !d)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={darkMode ? 'sun' : 'moon'}
                  initial={{ opacity: 0, rotate: -40, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0,   scale: 1 }}
                  exit={{    opacity: 0, rotate:  40,  scale: 0.6 }}
                  transition={{ duration: 0.16 }}
                  style={{ display: 'flex' }}
                >
                  {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            <motion.button
              className="leave-btn"
              onClick={leaveRoom}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              transition={springSnappy}
            >
              <LogOut size={13} />
              <span>Leave</span>
            </motion.button>
          </div>
        </motion.header>

        {/* ── Messages ── */}
        <main className="chat-messages">
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div
                className="chat-empty"
                variants={emptyVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              >
                <div className="chat-empty-rings">
                  <motion.div
                    className="ring ring-1"
                    animate={{ scale: [1, 1.18, 1] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="ring ring-2"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: 0.2 }}
                  />
                  <motion.div
                    className="ring ring-3"
                    animate={{ scale: [1, 1.07, 1], opacity: [0.25, 0.5, 0.25] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: 0.4 }}
                  />
                </div>
                <p className="chat-empty-title">Room is quiet</p>
                <p className="chat-empty-sub">Send the first message to get started</p>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length > 0 && (
            <div className="messages-list">
              <AnimatePresence initial={false}>
                {messages.map(msg => {
                  if (msg.sender === 'System') {
                    return (
                      <motion.div
                        key={msg.id}
                        className="msg-system"
                        variants={systemMsgVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        <span>{msg.text}</span>
                      </motion.div>
                    )
                  }

                  const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(msg.text || '')

                  return (
                    <motion.div
                      key={msg.id}
                      className={`msg-row ${msg.isOwn ? 'msg-row--own' : 'msg-row--other'}`}
                      variants={msg.isOwn ? ownBubbleVariants : otherBubbleVariants}
                      initial="hidden"
                      animate="visible"
                      layout
                    >
                      <motion.div
                        className={`msg-bubble ${msg.isOwn ? 'msg-bubble--own' : 'msg-bubble--other'}`}
                        whileHover={{ scale: 1.012 }}
                        transition={{ duration: 0.14 }}
                      >
                        {!msg.isOwn && (
                          <div className="msg-sender">{msg.sender}</div>
                        )}

                        {msg.image && (
                          <motion.img
                            src={msg.image}
                            alt="Shared image"
                            className="msg-img"
                            onClick={() => setZoomImage(msg.image)}
                            initial={{ opacity: 0, scale: 0.88 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={springBouncy}
                            whileHover={{ scale: 1.025, opacity: 0.9 }}
                          />
                        )}

                        {msg.text && (
                          <p
                            className={`msg-text ${isEmojiOnly ? 'msg-text--big' : 'emoji-size-fix'}`}
                            dangerouslySetInnerHTML={{
                              __html: isEmojiOnly ? msg.text : wrapEmojis(msg.text)
                            }}
                          />
                        )}

                        <div className="msg-time">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </motion.div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Upload toast */}
          <AnimatePresence>
            {imageUploading && (
              <motion.div
                className="upload-toast"
                variants={toastVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="spinner" />
                <span>Sending image</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </main>

        {/* ── Input bar ── */}
        <motion.footer
          className="chat-input-bar"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSnappy, delay: 0.1 }}
        >
          <div className="chat-input-wrap" ref={emojiPickerRef}>
            <div className="input-action-btns">
              <motion.button
                type="button"
                className="input-action"
                onClick={() => setShowEmojiPicker(p => !p)}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                transition={springSnappy}
                aria-label="Toggle emoji picker"
              >
                <Smile size={17} />
              </motion.button>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="img-upload"
              />
              <motion.label
                htmlFor="img-upload"
                className="input-action"
                style={{ cursor: 'pointer' }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                transition={springSnappy}
                aria-label="Upload image"
              >
                <ImageIcon size={17} />
              </motion.label>
            </div>

            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Write a message..."
              className="chat-input-field"
            />

            <motion.button
              className="send-btn"
              onClick={sendMessage}
              disabled={!message.trim() || !connected}
              whileHover={message.trim() && connected ? { scale: 1.1 } : {}}
              whileTap={message.trim() && connected ? { scale: 0.88 } : {}}
              transition={springBouncy}
              aria-label="Send message"
            >
              <motion.span
                animate={message.trim() ? { x: [0, 2, 0] } : { x: 0 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                style={{ display: 'flex' }}
              >
                <Send size={15} />
              </motion.span>
            </motion.button>

            {/* Emoji picker */}
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  className="emoji-picker-wrap"
                  variants={emojiPickerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    theme={darkMode ? 'dark' : 'light'}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.footer>
      </div>

      {/* ── Image zoom overlay ── */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div
            className="zoom-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setZoomImage(null)}
          >
            <motion.img
              src={zoomImage}
              alt="Zoomed"
              className="zoom-img"
              variants={zoomImgVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={e => e.stopPropagation()}
            />
            <motion.button
              className="zoom-close-btn"
              onClick={() => setZoomImage(null)}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1, transition: { ...springBouncy, delay: 0.08 } }}
              exit={{    opacity: 0, scale: 0.7 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Close zoom"
            >
              &times;
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App