import { useEffect, useRef, useState } from 'react'
import {
  Send, Users, Wifi, WifiOff, Moon, Sun,
  Smile, ImageIcon, LogOut, Copy, Check, ArrowLeft, Hash
} from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'

/* ============================================================
   All state + logic is identical to the original.
   Only the JSX / className layer has been redesigned.
   ============================================================ */

function App() {
  const [username, setUsername]         = useState("")
  const [roomId, setRoomId]             = useState("")
  const [connected, setconnected]       = useState(false)
  const [joined, setJoined]             = useState(false)
  const [usersCount, setUsersCount]     = useState(0)
  const [messages, setMessages]         = useState([])
  const messagesEndRef                  = useRef()
  const [message, setMessage]           = useState("")
  const [ws, setwsocket]                = useState()
  const [darkMode, setDarkMode]         = useState(true)
  const usernameRef                     = useRef(username)
  const [mySessionId, setMySessionId]   = useState(null)
  const mySessionIdRef                  = useRef(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiPickerRef                  = useRef()
  const [zoomImage, setZoomImage]       = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [showJoinExisting, setShowJoinExisting] = useState(false)
  const [copied, setCopied]             = useState(false)

  // ── WebSocket bootstrap ─────────────────────────────────
  useEffect(() => {
    const socket = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL)
    setwsocket(socket)

    socket.onopen = () => { setconnected(true) }

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

  // ── Auto-scroll ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Username ref sync ───────────────────────────────────
  useEffect(() => { usernameRef.current = username }, [username])

  // ── WS cleanup ──────────────────────────────────────────
  useEffect(() => {
    return () => { if (ws && ws.readyState === WebSocket.OPEN) ws.close() }
  }, [ws])

  // ── Emoji picker outside-click ──────────────────────────
  useEffect(() => {
    const handleOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false)
      }
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

  function toggleDarkMode() { setDarkMode(d => !d) }

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
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leave", payload: { roomId, username } }))
    }
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

  // ── Root class ───────────────────────────────────────────
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
          <button className="theme-toggle-fixed" onClick={toggleDarkMode} aria-label="Toggle theme">
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <div className="join-card">
            {/* Brand */}
            <div className="join-brand">
              <div className="join-logo-mark">E</div>
              <div>
                <div className="join-app-name">
                  {showJoinExisting ? 'Join a Room' : 'Echo'}
                </div>
                <div className="join-tagline">
                  {showJoinExisting
                    ? 'Enter a room code to connect'
                    : 'Private rooms. Real conversations.'}
                </div>
              </div>
            </div>

            <div className="join-sep" />

            <div className="join-form">
              {/* Name field — always visible */}
              <div className="form-field">
                <label className="form-label">Display name</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Who are you?"
                  className="form-input"
                />
              </div>

              {/* Room ID — join existing only */}
              {showJoinExisting && (
                <div className="form-field">
                  <label className="form-label">Room code</label>
                  <div className="form-input-wrap">
                    <span className="form-input-icon">
                      <Hash size={13} />
                    </span>
                    <input
                      type="text"
                      value={roomId}
                      onChange={e => setRoomId(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && username && roomId && connected) joinExistingRoom()
                      }}
                      placeholder="Paste room code here"
                      className="form-input form-input--icon"
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="form-actions">
                {!showJoinExisting ? (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={createRoom}
                      disabled={!username.trim() || !connected}
                    >
                      Create new room
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={() => { setShowJoinExisting(true); setRoomId("") }}
                      disabled={!username.trim() || !connected}
                    >
                      Join existing room
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={joinExistingRoom}
                      disabled={!roomId.trim() || !username.trim() || !connected}
                    >
                      Join room
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setShowJoinExisting(false); setRoomId("") }}
                    >
                      <ArrowLeft size={14} />
                      Back
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Connection status */}
            <div className="join-status-row">
              <div className={`pulse-dot ${connected ? 'pulse-dot--on' : 'pulse-dot--off'}`} />
              <span className="join-status-text">
                {connected ? 'Connected to server' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="join-credit">Built by Harsh Gupta</div>
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
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-logo-sm">E</div>

            <div className="chat-room-meta">
              <div className="chat-room-row">
                <span className="chat-room-tag">ROOM</span>
                <code className="chat-room-id">{roomId}</code>
                <button className="copy-pill" onClick={copyRoomId}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="chat-user-line">
                Signed in as <strong>{username}</strong>
              </div>
            </div>
          </div>

          <div className="chat-header-right">
            <div className="online-count">
              <div className="online-dot" />
              <span>{usersCount > 0 ? usersCount - 1 : 0} online</span>
            </div>

            <div className="h-sep" />

            <div className={`conn-badge ${connected ? 'on' : 'off'}`}>
              {connected
                ? <Wifi size={13} />
                : <WifiOff size={13} />}
              <span>{connected ? 'Live' : 'Offline'}</span>
            </div>

            <button className="icon-btn" onClick={toggleDarkMode} aria-label="Toggle theme">
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button className="leave-btn" onClick={leaveRoom}>
              <LogOut size={13} />
              <span>Leave</span>
            </button>
          </div>
        </header>

        {/* ── Messages ── */}
        <main className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-rings">
                <div className="ring ring-1" />
                <div className="ring ring-2" />
                <div className="ring ring-3" />
              </div>
              <p className="chat-empty-title">Room is quiet</p>
              <p className="chat-empty-sub">Send the first message to get started</p>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map(msg => {
                if (msg.sender === 'System') {
                  return (
                    <div key={msg.id} className="msg-system">
                      <span>{msg.text}</span>
                    </div>
                  )
                }

                const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(msg.text || '')

                return (
                  <div
                    key={msg.id}
                    className={`msg-row ${msg.isOwn ? 'msg-row--own' : 'msg-row--other'}`}
                  >
                    <div className={`msg-bubble ${msg.isOwn ? 'msg-bubble--own' : 'msg-bubble--other'}`}>
                      {!msg.isOwn && (
                        <div className="msg-sender">{msg.sender}</div>
                      )}

                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Shared image"
                          className="msg-img"
                          onClick={() => setZoomImage(msg.image)}
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
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Upload indicator */}
          {imageUploading && (
            <div className="upload-toast">
              <div className="spinner" />
              <span>Sending image</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* ── Input bar ── */}
        <footer className="chat-input-bar">
          <div className="chat-input-wrap" ref={emojiPickerRef}>
            {/* Left action buttons */}
            <div className="input-action-btns">
              <button
                type="button"
                className="input-action"
                onClick={() => setShowEmojiPicker(p => !p)}
                aria-label="Toggle emoji picker"
              >
                <Smile size={17} />
              </button>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="img-upload"
              />
              <label
                htmlFor="img-upload"
                className="input-action"
                style={{ cursor: 'pointer' }}
                aria-label="Upload image"
              >
                <ImageIcon size={17} />
              </label>
            </div>

            {/* Text input */}
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Write a message..."
              className="chat-input-field"
            />

            {/* Send button */}
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!message.trim() || !connected}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>

            {/* Emoji picker */}
            {showEmojiPicker && (
              <div className="emoji-picker-wrap">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={darkMode ? 'dark' : 'light'}
                />
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* ── Image zoom overlay ── */}
      {zoomImage && (
        <div className="zoom-overlay" onClick={() => setZoomImage(null)}>
          <img
            src={zoomImage}
            alt="Zoomed"
            className="zoom-img"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="zoom-close-btn"
            onClick={() => setZoomImage(null)}
            aria-label="Close zoom"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

export default App