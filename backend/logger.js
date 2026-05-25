/**
 * Minimal structured logger.
 * Outputs JSON lines in production, readable text in development.
 */

const isProd = process.env.NODE_ENV === 'production'

function format(level, msg, ...args) {
  const ts   = new Date().toISOString()
  const extra = args.length ? args.map(a => (a instanceof Error ? a.stack : JSON.stringify(a))).join(' ') : ''

  if (isProd) {
    return JSON.stringify({ ts, level, msg, extra: extra || undefined })
  }

  const colours = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' }
  const reset   = '\x1b[0m'
  const colour  = colours[level] || ''
  return `${colour}[${level.toUpperCase()}]${reset} ${ts} ${msg}${extra ? ' ' + extra : ''}`
}

const logger = {
  info:  (msg, ...a) => console.log(format('info',  msg, ...a)),
  warn:  (msg, ...a) => console.warn(format('warn',  msg, ...a)),
  error: (msg, ...a) => console.error(format('error', msg, ...a)),
  debug: (msg, ...a) => { if (process.env.DEBUG) console.log(format('debug', msg, ...a)) }
}

export default logger