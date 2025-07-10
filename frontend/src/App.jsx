import { useEffect, useRef, useState } from 'react'


function App() {
const [allMessages, setAllMessages] = useState([])
const wsRef=useRef()
const inputRef=useRef()

useEffect(()=>{
const ws=new WebSocket("ws://localhost:8080")
wsRef.current=ws

ws.onopen= ()=>{
ws.send(JSON.stringify({
  type: 'join',
  payload: {
    RoomId: 123584
  }
}))

}

ws.onmessage=(e)=>{
  const msg=e.data
setAllMessages((prev)=>[...prev ,msg])
}


return function(){
ws.close()
}

},[])



function sendMessage(){
wsRef.current.send(JSON.stringify({
  type: 'chat',
  payload: {
    message: inputRef.current.value
  }
}))
inputRef.current.value=""
  
  }

  return (
    <>
      <div className='h-screen flex flex-col justify-between bg-black'>
        <br />
              <div className='h-[85vh]'>
            {
              allMessages.map((msg)=>
              <div className='m-10'> 
                <span className='bg-white text-black rounded p-3'>{msg}</span>
              </div>

              )
            }
              </div>
              <div className='w-full bg-white flex'>
              <input ref={inputRef} type="text" placeholder='Enter message...' className='flex-1 p-4' onKeyDown={(e)=>{
if(e.key=='Enter' && inputRef.value!=""){
      sendMessage()
}
              }}/>
              <button className='bg-purple-600 text-white p-4' onClick={sendMessage}>send message</button>
              </div>
      </div>
    </>
  )
}

export default App
