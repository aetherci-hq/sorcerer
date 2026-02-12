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
  /** Fixed-size character array stored as a string, padded with null chars initially */
  data: string
  /** Current write position (index into data) */
  writePos: number
  /** Whether the buffer has wrapped around at least once */
  wrapped: boolean
  /** Total characters written (used for bookkeeping) */
  totalWritten: number
}

export class ScrollbackBuffer {
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
        data: '',
        writePos: 0,
        wrapped: false,
        totalWritten: 0
      }
      this.sessions.set(sessionId, session)
    }

    // If the chunk alone is larger than the buffer, only keep the tail
    if (chunk.length >= this.maxSize) {
      const tail = chunk.slice(chunk.length - this.maxSize)
      // Ensure we don't start with a lone low surrogate
      const cleaned = this.trimLeadingBrokenSurrogate(tail)
      session.data = cleaned
      session.writePos = cleaned.length % this.maxSize
      session.wrapped = cleaned.length >= this.maxSize
      session.totalWritten += chunk.length
      return
    }

    // Ensure the backing string is the right size. We grow it as needed up to maxSize.
    // For efficiency, we work with the buffer as an array of characters when writing,
    // then join back to a string.

    const needed = session.writePos + chunk.length
    if (!session.wrapped && needed <= this.maxSize) {
      // Simple case: haven't wrapped yet and the chunk fits
      session.data = session.data + chunk
      session.writePos += chunk.length
      if (session.writePos >= this.maxSize) {
        session.writePos = session.writePos % this.maxSize
        session.wrapped = true
      }
    } else {
      // Need to write with wrapping
      // Ensure backing data is padded to maxSize if we're about to wrap
      if (session.data.length < this.maxSize) {
        session.data = session.data + '\0'.repeat(this.maxSize - session.data.length)
      }

      // Convert to array for efficient character-by-character writing
      const chars = session.data.split('')
      let pos = session.writePos

      for (let i = 0; i < chunk.length; i++) {
        chars[pos] = chunk[i]
        pos++
        if (pos >= this.maxSize) {
          pos = 0
          session.wrapped = true
        }
      }

      session.data = chars.join('')
      session.writePos = pos
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
      // Buffer hasn't wrapped - data is contiguous from start to writePos
      return session.data.slice(0, session.writePos)
    }

    // Buffer has wrapped: read from writePos to end, then from start to writePos.
    // writePos is where the NEXT write would go, so the oldest data starts there.
    const tail = session.data.slice(session.writePos)
    const head = session.data.slice(0, session.writePos)
    const result = tail + head

    // Trim any leading broken surrogate from the oldest portion
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
}
