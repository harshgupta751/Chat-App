import {WebSocketServer} from 'ws'

const socketsServer= new WebSocketServer({port:8080})

const allConnected = []

socketsServer.on('connection', function(socket){

    socket.onmessage= (e)=>{
       const msg= JSON.parse(e.data)
       if(msg.type=="join"){
            allConnected.push({
                socket: socket,
                RoomId: msg.payload.RoomId
            })

       }
       if(msg.type=="chat"){
        const currentSocket= allConnected.find((ele)=>{
            return ele.socket==socket
        })
        let currentRoomId=null
        if(currentSocket){
       currentRoomId= currentSocket.RoomId
        }

        for(let i=0;i<allConnected.length;i++){
            if(allConnected[i].RoomId==currentRoomId){
              allConnected[i].socket.send(msg.payload.message)
            }
        }

       }


    }

})

