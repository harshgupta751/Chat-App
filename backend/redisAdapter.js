import { EventEmitter } from 'events'
import logger from './logger.js'

/**
 * Redis Pub/Sub Adapter
 *
 * When a message is published to a room channel, the adapter
 * receives it on the subscriber client and emits a 'message' event.
 * The server listens for that event and fans out to local WebSocket clients.
 *
 * This enables horizontal scaling: N server instances all share the same
 * Redis Pub/Sub bus, so a message sent on instance A reaches clients on
 * instances B, C, etc.
 */
export function createAdapter(subClient, wss) {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(0) // large fleets can have many rooms

  // We use a pattern subscription so one sub handles ALL room channels
  subClient.pSubscribe('room:*', (message, channel) => {
    try {
      const roomId  = channel.replace('room:', '')
      const payload = JSON.parse(message)
      emitter.emit('message', { roomId, payload })
    } catch (err) {
      logger.error('Adapter parse error:', err)
    }
  }).catch(err => {
    logger.error('pSubscribe error:', err)
  })

  logger.info('Redis Pub/Sub adapter initialised — subscribed to room:*')

  return emitter
}