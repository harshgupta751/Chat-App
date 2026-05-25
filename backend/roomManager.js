/**
 * RoomManager
 *
 * Maintains room membership in Redis so that:
 *  - User counts are accurate across multiple server instances
 *  - Stale sessions are cleaned up via TTL
 *  - Empty rooms are removed from the active-rooms set
 */
export class RoomManager {
  constructor(
    redisClient,
    {
      memberTtl     = 86_400,  // 24 hours — session TTL
      roomKeyPrefix = 'room:'
    } = {}
  ) {
    this.redis         = redisClient
    this.memberTtl     = memberTtl
    this.roomKeyPrefix = roomKeyPrefix
  }

  // ─── Internal key helpers ───────────────────
  #membersKey(roomId)    { return `${this.roomKeyPrefix}${roomId}:members` }
  #usernamesKey(roomId)  { return `${this.roomKeyPrefix}${roomId}:usernames` }

  /**
   * Add a session to a room.
   * Uses a Redis Set for O(1) membership operations.
   */
  async addMember(roomId, sessionId, username) {
    await Promise.all([
      this.redis.sAdd(this.#membersKey(roomId),   sessionId),
      this.redis.hSet(this.#usernamesKey(roomId), sessionId, username),
      this.redis.expire(this.#membersKey(roomId),   this.memberTtl),
      this.redis.expire(this.#usernamesKey(roomId), this.memberTtl),
      this.redis.sAdd('active_rooms', roomId)
    ])
  }

  /**
   * Remove a session from a room.
   * Cleans up the room from the active-rooms set if it becomes empty.
   */
  async removeMember(roomId, sessionId) {
    await Promise.all([
      this.redis.sRem(this.#membersKey(roomId),   sessionId),
      this.redis.hDel(this.#usernamesKey(roomId), sessionId)
    ])

    // Clean up empty rooms
    const remaining = await this.redis.sCard(this.#membersKey(roomId))
    if (remaining === 0) {
      await Promise.all([
        this.redis.del(this.#membersKey(roomId)),
        this.redis.del(this.#usernamesKey(roomId)),
        this.redis.sRem('active_rooms', roomId)
      ])
    }
  }

  /**
   * Returns the number of active members in a room.
   */
  async getMemberCount(roomId) {
    return this.redis.sCard(this.#membersKey(roomId))
  }

  /**
   * Returns a list of { sessionId, username } objects for all room members.
   */
  async getMembers(roomId) {
    const [sessionIds, usernameMap] = await Promise.all([
      this.redis.sMembers(this.#membersKey(roomId)),
      this.redis.hGetAll(this.#usernamesKey(roomId))
    ])
    return sessionIds.map(sid => ({
      sessionId: sid,
      username:  usernameMap[sid] || 'Unknown'
    }))
  }

  /**
   * Checks whether a session is a member of a room.
   */
  async isMember(roomId, sessionId) {
    return this.redis.sIsMember(this.#membersKey(roomId), sessionId)
  }

  /**
   * Returns all active room IDs.
   */
  async getActiveRooms() {
    return this.redis.sMembers('active_rooms')
  }
}