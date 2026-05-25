/**
 * Token-Bucket Rate Limiter (Redis-backed)
 *
 * Each IP gets a bucket with a maximum of `limit` tokens.
 * Tokens refill over `windowMs` milliseconds.
 * Every incoming message costs 1 token.
 * When the bucket empties, further messages are rejected.
 */
export class RateLimiter {
  constructor(
    redisClient,
    {
      limit    = 60,      // max messages per window
      windowMs = 60_000,  // window size in ms (1 minute)
      prefix   = 'rl:'
    } = {}
  ) {
    this.redis    = redisClient
    this.limit    = limit
    this.windowMs = windowMs
    this.prefix   = prefix
  }

  /**
   * Returns true if the IP has exceeded the rate limit.
   */
  async isLimited(ip) {
    const key     = `${this.prefix}${ip}`
    const windowS = Math.ceil(this.windowMs / 1000)

    try {
      const current = await this.redis.incr(key)

      if (current === 1) {
        // First request in this window — set expiry
        await this.redis.expire(key, windowS)
      }

      return current > this.limit
    } catch (err) {
      // If Redis is unavailable, fail open (allow the request)
      // to avoid a Redis outage taking down the whole chat
      console.error('RateLimiter Redis error (fail-open):', err.message)
      return false
    }
  }

  /**
   * Returns the remaining token count for an IP.
   */
  async remaining(ip) {
    const key = `${this.prefix}${ip}`
    try {
      const current = await this.redis.get(key)
      return Math.max(0, this.limit - (parseInt(current, 10) || 0))
    } catch {
      return this.limit
    }
  }
}