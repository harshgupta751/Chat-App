import {WebSocketServer} from 'ws'

const socketsServer= new WebSocketServer({port:8080})

const allConnected = []

socketsServer.on('connection', function(socket){

    socket.onmessage= (e)=>{
       const msg= JSON.parse(e.data)
       if(msg.type=="join"){
            allConnected.push({
                socket: socket,
                RoomId: msg.payload.RoomId,
                username: msg.payload.username
            })

            const currentSocket=allConnected.find((ele)=>ele.socket==socket)
            let currentRoomId=null
            if(currentSocket){
                currentRoomId=currentSocket.RoomId
            }
                let usersCount=0;
            for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].RoomId==currentRoomId){
                    usersCount++;
                }
            }
                 for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].RoomId==currentRoomId){
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
        const currentSocket= allConnected.find((ele)=>{
            return ele.socket==socket
        })
        let currentRoomId=null
        let senderUsername=null
        if(currentSocket){
       currentRoomId= currentSocket.RoomId
       senderUsername=currentSocket.username
        }

        for(let i=0;i<allConnected.length;i++){
            if(allConnected[i].RoomId==currentRoomId){
              allConnected[i].socket.send(JSON.stringify({
                sender: senderUsername,
                text: msg.payload.message,
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
                if(allConnected[i].RoomId==currentRoomId){
                    usersCount++;
                }
            }

             for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].RoomId==currentRoomId){
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
                currentRoomId=currentSocket.RoomId
            }
      if(currentRoomId){
                let usersCount=0;
            for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].RoomId==currentRoomId){
                    usersCount++;
                }
            }
        

             for(let i=0;i<allConnected.length;i++){
                if(allConnected[i].RoomId==currentRoomId){
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

