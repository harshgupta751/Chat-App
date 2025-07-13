import { useEffect, useRef, useState } from 'react'
import { Send, Users, Wifi, WifiOff, MessageCircle, Hash, Moon, Sun } from 'lucide-react';


function App() {
const [username, setUsername] =useState("")
const [roomId,setRoomId] = useState("")
const [connected, setconnected] = useState(false)
const [joined, setJoined]= useState(false)
const [usersCount, setUsersCount] = useState(0)
const [messages, setMessages] = useState([])
const messagesEndRef= useRef()
const [message, setMessage]= useState("")
const [ws,setwsocket]= useState()
const [darkMode, setDarkMode]= useState(true)
const idCount=useRef(1)
const roomRef=useRef()
const usernameRef=useRef(username)

useEffect(()=>{
const socket= new WebSocket(import.meta.env.VITE_WEBSOCKET_URL)
setwsocket(socket)
socket.onopen=()=>{
  setconnected(true)
}

socket.onmessage=(e)=>{
  const parsed=JSON.parse(e.data)

if(parsed.sender=="System"){
 setUsersCount(parsed.usersCount)

 if(parsed.message=='join' && parsed.username!=usernameRef.current){
setMessages((prev)=>[...prev,{
  id: idCount.current,
  isOwn: false,
  sender: 'System',
  text: `${parsed.username} has joined the room`,
  timestamp: new Date(parsed.timestamp)
}])
idCount.current= idCount.current + 1

 }

if(parsed.message=='leave' && parsed.username!=usernameRef.current){
setMessages((prev)=>[...prev,{
  id: idCount.current,
  isOwn: false,
  sender: 'System',
  text: `${parsed.username} has left the room`,
  timestamp: new Date(parsed.timestamp)
}])
idCount.current= idCount.current + 1


}



}else{

  setMessages((prev)=>[...prev,{
    id: idCount.current,
    isOwn: parsed.sender==usernameRef.current,
    sender: parsed.sender,
    text: parsed.text,
    timestamp: new Date(parsed.timestamp)

  }])
  idCount.current=idCount.current + 1

}
}

return function(){

  if(connected){
   socket.close()
  }
}


},[])


useEffect(()=>{
messagesEndRef.current?.scrollIntoView({behavior: 'smooth'})

},[messages])

useEffect(()=>{
usernameRef.current=username

},[username])

useEffect(()=>{


return function(){
if(ws && ws.readyState===WebSocket.OPEN){
  ws.close()
}

}

},[ws])






function handleKeyPress(e){
if(e.key=='Enter' && message && connected){
sendMessage()
}

}

function toggleDarkMode(){
setDarkMode(!darkMode)

}


function joinRoom(){

ws.send(JSON.stringify({
type: "join",
payload: {
  RoomId: roomId,
  username: username
}
}))

  setJoined(true)
}

function leaveRoom(){
  if(ws && ws.readyState===WebSocket.OPEN){
  ws.send(JSON.stringify({
    type: "leave",
    payload: {
      roomId: roomId,
      username: username
    }
  }))
}
setJoined(false)
setUsername("")
setRoomId("")
setMessages([])
}

function sendMessage(){
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    message: message
  }
}))
setMessage("")

}




  if (!joined) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'} flex items-center justify-center p-4`}>
        <div className={`${darkMode ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-md border ${darkMode ? 'border-gray-700/20' : 'border-white/20'}`}>
          <div className="absolute top-4 right-4">
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-all duration-200`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
          <div className="text-center mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>Join Chat Room</h1>
            <p className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Enter your details to start chatting</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                Your Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e)=>{
                    if(e.key=='Enter' && username){
                      roomRef.current.focus()
                    }
                }}
                placeholder="Enter your name"
                className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'} rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                Room ID
              </label>
              <div className="relative">
                <Hash className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'} w-5 h-5`} />
                <input
                  type="text"
                  ref={roomRef}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={(e)=>{
                    if(e.key=='Enter' && username && roomId && connected){
                      joinRoom()
                    }
                  }}
                  placeholder="Enter room ID"
                  className={`w-full pl-10 pr-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'} rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200`}
                />
              </div>
            </div>

            <button
              onClick={joinRoom}
              disabled={!roomId.trim() || !username.trim() || !connected}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
            >
              Join Room
            </button>
          </div>

          <div className={`mt-6 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <div className="flex items-center justify-center space-x-2">
              {connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-red-600">Disconnected</span>
                </>
              )}
            </div>
          </div>
         <div className={`mt-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
  Created by <span className="font-semibold">Harsh Gupta</span>
</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'}`}>
      {/* Header */}
      <div className={`fixed top-0 w-full z-50 ${darkMode ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur-sm border-b ${darkMode ? 'border-gray-700/20' : 'border-white/20'} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full w-10 h-10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Room #{roomId}</h1>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Welcome, {username}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Users className={`w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{usersCount-1} online</span>
            </div>
            <div className="flex items-center space-x-2">
              {connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">Disconnected</span>
                </>
              )}
            </div>
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-all duration-200`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={leaveRoom}
              className={`text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg ${darkMode ? 'hover:bg-red-900/20' : 'hover:bg-red-50'} transition-colors`}
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 mt-[120px] sm:mt-[88px] mb-[96px]">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'} text-lg`}>No messages yet</p>
            <p className={`${darkMode ? 'text-gray-500' : 'text-gray-400'} text-sm`}>Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                  msg.isOwn
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                    : msg.sender === 'System'
                    ? `${darkMode ? 'bg-gray-700 text-gray-300 border border-gray-600' : 'bg-gray-100 text-gray-700 border border-gray-200'}`
                    : `${darkMode ? 'bg-gray-700 text-gray-200 border border-gray-600' : 'bg-white text-gray-800 border border-gray-200'}`
                }`}
              >
                {!msg.isOwn && msg.sender !== 'System' && (
                  <p className={`text-xs font-medium mb-1 opacity-70`}>{msg.sender}</p>
                )}
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p className={`text-xs mt-1 ${msg.isOwn ? 'text-white/70' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className={`fixed bottom-0 w-full z-50 ${darkMode ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur-sm border-t ${darkMode ? 'border-gray-700/20' : 'border-white/20'} p-6`}>
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message..."
              className={`w-full px-4 py-3 pr-12 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'} rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200`}
            />
            <button
              onClick={sendMessage}
              disabled={!message.trim() || !connected}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-blue-500 to-purple-600 text-white p-2 rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App
