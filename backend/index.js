import {WebSocketServer} from 'ws'
import dotenv from 'dotenv'
dotenv.config()
const socketsServer= new WebSocketServer({port:process.env.PORT})

const allConnected = []

socketsServer.on('connection', function(socket){

    socket.onmessage= (e)=>{
       const msg= JSON.parse(e.data)
       if(msg.type=="join"){

        const index= allConnected.findIndex((ele)=> ele.socket==socket)
        if(index!=-1){
            allConnected.splice(index,1)
        }

            allConnected.push({
                socket: socket,
                roomId: msg.payload.roomId,
                username: msg.payload.username
            })

             const currentRoomId=msg.payload.roomId
            
                let usersCount=0;
            for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    usersCount++;
                }
            }
                 for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    allConnected[i].socket.send(JSON.stringify({
                        sender: 'System',
                        message: 'join',
                        username: msg.payload.username,
                        timestamp: new Date(),
                        usersCount: usersCount
                    }))
                }
            }

       }
       if(msg.type=="chat"){

    const currentRoomId= msg.payload.roomId

        for(let i=0;i<allConnected.length;i++){
            if(allConnected[i].roomId==currentRoomId){
              allConnected[i].socket.send(JSON.stringify({
                sender: msg.payload.username,
                text: msg.payload.message,
                image: msg.payload.image,
                timestamp: new Date()
              }))
            }
        }

       }
        if(msg.type=="leave"){
            const findIndex= allConnected.findIndex((ele)=>ele.socket==socket)
        allConnected.splice(findIndex,1)
        
       const currentRoomId=msg.payload.roomId
                let usersCount=0;
            for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    usersCount++;
                }
            }

             for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    allConnected[i].socket.send(JSON.stringify({
                        sender: 'System',
                        message: 'leave',
                        username: msg.payload.username,
                        timestamp: new Date(),
                        usersCount: usersCount
                    }))
                }
            }

        }

    }

    socket.onclose= ()=>{
            const findIndex= allConnected.findIndex((ele)=>ele.socket==socket)
            if(findIndex==-1){
                return
            }
            const currentSocket=allConnected[findIndex]
        allConnected.splice(findIndex,1)
       
           let currentRoomId=null
            if(currentSocket){
                currentRoomId=currentSocket.roomId
            }
      if(currentRoomId){
                let usersCount=0;
            for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    usersCount++;
                }
            }
        

             for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].roomId==currentRoomId){
                    allConnected[i].socket.send(JSON.stringify({
                        sender: 'System',
                        message: 'leave',
                        username: currentSocket.username,
                        timestamp: new Date(),
                        usersCount: usersCount
                    }))
                }
            }
        }

    }


})

