/**
 * ScrollbackBuffer - A ring buffer that stores the last N bytes of PTY output
 * per terminal session, enabling reconnecting remote clients to replay
 * terminal history.
 *
 * Uses a string-based circular buffer per session. Each session's buffer has
 * a fixed maximum size, and when full, the oldest data is overwritten.
 *
 * UTF-8 safety: Since JavaScript strings are sequences of UTF-16 code units,
 * we track size in characters (code units). When the buffer wraps around and
 * we reconstruct output, we ensure we never split surrogate pairs (which
 * represent characters outside the Basic Multilingual Plane, like emoji).
 */

interface SessionBuffer {
  /** Fixed-size buffer storing UTF-16 code units */
  buf: Uint16Array
  /** How much of the buffer has been filled (before first wrap) */
  length: number
  /** Current write position (index into buf) */
  writePos: number
  /** Whether the buffer has wrapped around at least once */
  wrapped: boolean
  /** Total characters written (used for bookkeeping) */
  totalWritten: number
}

export class ScrollbackBuffer {
  private static readonly DECODE_CHUNK_SIZE = 8192
  private sessions: Map<string, SessionBuffer> = new Map()
  private maxSize: number

  constructor(maxSizePerSession: number = 256 * 1024) {
    if (maxSizePerSession <= 0) {
      throw new Error('maxSizePerSession must be a positive number')
    }
    this.maxSize = maxSizePerSession
  }

  /**
   * Append terminal output for a session.
   * If the chunk exceeds the buffer size, only the last maxSize characters
   * are kept.
   */
  append(sessionId: string, chunk: string): void {
    if (chunk.length === 0) return

    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        buf: new Uint16Array(this.maxSize),
        length: 0,
        writePos: 0,
        wrapped: false,
        totalWritten: 0
      }
      this.sessions.set(sessionId, session)
    }

    // If the chunk alone is larger than the buffer, only keep the tail
    if (chunk.length >= this.maxSize) {
      const start = chunk.length - this.maxSize
      for (let i = 0; i < this.maxSize; i++) {
        session.buf[i] = chunk.charCodeAt(start + i)
      }
      session.length = this.maxSize
      session.writePos = 0
      session.wrapped = true
      session.totalWritten += chunk.length
      return
    }

    // Write chunk character-by-character into the typed array
    let pos = session.writePos
    for (let i = 0; i < chunk.length; i++) {
      session.buf[pos] = chunk.charCodeAt(i)
      pos++
      if (pos >= this.maxSize) {
        pos = 0
        session.wrapped = true
      }
    }
    session.writePos = pos
    if (!session.wrapped) {
      session.length = pos
    }
    session.totalWritten += chunk.length
  }

  /**
   * Get full scrollback content for replay on reconnect.
   * Returns the data in correct chronological order.
   */
  getScrollback(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    if (!session) return ''

    if (!session.wrapped) {
      return this.decodeBuffer(session.buf.subarray(0, session.length))
    }

    // Buffer has wrapped: oldest data starts at writePos
    const tail = session.buf.subarray(session.writePos)
    const head = session.buf.subarray(0, session.writePos)
    const result = this.decodeBuffer(tail) + this.decodeBuffer(head)

    return this.trimLeadingBrokenSurrogate(result)
  }

  /**
   * Remove buffer for a session (when session ends).
   */
  remove(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /**
   * Clear all buffers.
   */
  clear(): void {
    this.sessions.clear()
  }

  /**
   * Check if a session has scrollback data.
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  /**
   * If the string starts with a lone low surrogate (orphaned second half
   * of a surrogate pair), trim it so we don't produce broken text.
   */
  private trimLeadingBrokenSurrogate(str: string): string {
    if (str.length === 0) return str
    const code = str.charCodeAt(0)
    // Low surrogate range: 0xDC00-0xDFFF
    if (code >= 0xdc00 && code <= 0xdfff) {
      return str.slice(1)
    }
    return str
  }

  private decodeBuffer(buf: Uint16Array): string {
    if (buf.length === 0) return ''

    let result = ''
    for (let index = 0; index < buf.length; index += ScrollbackBuffer.DECODE_CHUNK_SIZE) {
      const chunk = buf.subarray(index, index + ScrollbackBuffer.DECODE_CHUNK_SIZE)
      result += String.fromCharCode(...chunk)
    }
    return result
  }
}
