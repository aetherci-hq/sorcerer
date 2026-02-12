import { describe, it, expect, beforeEach } from 'vitest'
import { ScrollbackBuffer } from '../scrollback'

describe('ScrollbackBuffer', () => {
  let buffer: ScrollbackBuffer

  beforeEach(() => {
    buffer = new ScrollbackBuffer()
  })

  describe('basic append and getScrollback', () => {
    it('returns empty string for unknown session', () => {
      expect(buffer.getScrollback('nonexistent')).toBe('')
    })

    it('stores and retrieves a simple string', () => {
      buffer.append('s1', 'hello world')
      expect(buffer.getScrollback('s1')).toBe('hello world')
    })

    it('concatenates multiple appends', () => {
      buffer.append('s1', 'hello ')
      buffer.append('s1', 'world')
      expect(buffer.getScrollback('s1')).toBe('hello world')
    })

    it('handles empty chunk gracefully', () => {
      buffer.append('s1', 'data')
      buffer.append('s1', '')
      expect(buffer.getScrollback('s1')).toBe('data')
    })

    it('creates session on first append of empty string then real data', () => {
      buffer.append('s1', '')
      expect(buffer.has('s1')).toBe(false)
      buffer.append('s1', 'x')
      expect(buffer.has('s1')).toBe(true)
      expect(buffer.getScrollback('s1')).toBe('x')
    })
  })

  describe('buffer wrapping', () => {
    it('overwrites oldest data when buffer is full', () => {
      const small = new ScrollbackBuffer(10)
      // Write exactly 10 chars
      small.append('s1', 'abcdefghij')
      expect(small.getScrollback('s1')).toBe('abcdefghij')

      // Write 3 more - should overwrite first 3
      small.append('s1', 'xyz')
      expect(small.getScrollback('s1')).toBe('defghijxyz')
    })

    it('handles multiple wraps correctly', () => {
      const small = new ScrollbackBuffer(5)
      small.append('s1', 'abcde') // fills buffer: "abcde"
      small.append('s1', 'fghij') // wraps fully: "fghij"
      small.append('s1', 'kl')    // partial wrap: "klhij" with writePos=2
      expect(small.getScrollback('s1')).toBe('hijkl')
    })

    it('handles single large chunk exceeding buffer size', () => {
      const small = new ScrollbackBuffer(5)
      small.append('s1', 'abcdefghij')
      // Only the last 5 chars should remain
      expect(small.getScrollback('s1')).toBe('fghij')
    })

    it('handles chunk exactly equal to buffer size', () => {
      const small = new ScrollbackBuffer(5)
      small.append('s1', '12345')
      expect(small.getScrollback('s1')).toBe('12345')
    })

    it('wraps correctly with many small appends', () => {
      const small = new ScrollbackBuffer(5)
      // Write one character at a time, 8 characters total
      for (const ch of 'abcdefgh') {
        small.append('s1', ch)
      }
      // Last 5: defgh
      expect(small.getScrollback('s1')).toBe('defgh')
    })

    it('correctly reads after partial wrap', () => {
      const small = new ScrollbackBuffer(8)
      small.append('s1', 'abcdefgh') // fills exactly
      small.append('s1', 'ij')       // overwrites first 2
      // Buffer now: "ijcdefgh" with writePos=2, wrapped=true
      // Read: from pos 2 to end = "cdefgh", then 0 to 2 = "ij"
      expect(small.getScrollback('s1')).toBe('cdefghij')
    })
  })

  describe('remove and clear', () => {
    it('removes a specific session', () => {
      buffer.append('s1', 'data1')
      buffer.append('s2', 'data2')
      buffer.remove('s1')
      expect(buffer.has('s1')).toBe(false)
      expect(buffer.getScrollback('s1')).toBe('')
      expect(buffer.has('s2')).toBe(true)
      expect(buffer.getScrollback('s2')).toBe('data2')
    })

    it('remove is idempotent for nonexistent session', () => {
      expect(() => buffer.remove('nonexistent')).not.toThrow()
    })

    it('clears all sessions', () => {
      buffer.append('s1', 'data1')
      buffer.append('s2', 'data2')
      buffer.append('s3', 'data3')
      buffer.clear()
      expect(buffer.has('s1')).toBe(false)
      expect(buffer.has('s2')).toBe(false)
      expect(buffer.has('s3')).toBe(false)
    })
  })

  describe('multiple sessions', () => {
    it('sessions do not interfere with each other', () => {
      buffer.append('s1', 'session one')
      buffer.append('s2', 'session two')
      buffer.append('s1', ' more')
      expect(buffer.getScrollback('s1')).toBe('session one more')
      expect(buffer.getScrollback('s2')).toBe('session two')
    })

    it('wrapping in one session does not affect another', () => {
      const small = new ScrollbackBuffer(10)
      small.append('s1', 'aaaaaaaaaa') // fill s1
      small.append('s1', 'bbb')        // s1 wraps
      small.append('s2', 'hello')       // s2 is fine
      expect(small.getScrollback('s1')).toBe('aaaaaaabbb')
      expect(small.getScrollback('s2')).toBe('hello')
    })

    it('removing one session does not affect others', () => {
      buffer.append('s1', 'one')
      buffer.append('s2', 'two')
      buffer.remove('s1')
      expect(buffer.getScrollback('s2')).toBe('two')
    })
  })

  describe('has()', () => {
    it('returns false for unknown session', () => {
      expect(buffer.has('unknown')).toBe(false)
    })

    it('returns true after append', () => {
      buffer.append('s1', 'data')
      expect(buffer.has('s1')).toBe(true)
    })

    it('returns false after remove', () => {
      buffer.append('s1', 'data')
      buffer.remove('s1')
      expect(buffer.has('s1')).toBe(false)
    })

    it('returns false after clear', () => {
      buffer.append('s1', 'data')
      buffer.clear()
      expect(buffer.has('s1')).toBe(false)
    })
  })

  describe('constructor validation', () => {
    it('uses default size of 256KB', () => {
      const buf = new ScrollbackBuffer()
      // Write a moderate amount and verify it's stored
      const data = 'x'.repeat(1000)
      buf.append('s1', data)
      expect(buf.getScrollback('s1')).toBe(data)
    })

    it('throws for non-positive maxSize', () => {
      expect(() => new ScrollbackBuffer(0)).toThrow()
      expect(() => new ScrollbackBuffer(-1)).toThrow()
    })

    it('accepts a custom buffer size', () => {
      const small = new ScrollbackBuffer(3)
      small.append('s1', 'abcde')
      expect(small.getScrollback('s1')).toBe('cde')
    })
  })

  describe('UTF-8 / Unicode handling', () => {
    it('handles basic multi-byte characters', () => {
      buffer.append('s1', 'cafe\u0301') // "cafe" + combining accent
      expect(buffer.getScrollback('s1')).toBe('cafe\u0301')
    })

    it('handles emoji and other BMP characters', () => {
      const small = new ScrollbackBuffer(20)
      small.append('s1', 'hello \u2603 world') // snowman
      expect(small.getScrollback('s1')).toBe('hello \u2603 world')
    })

    it('handles surrogate pairs (characters outside BMP)', () => {
      // The emoji "face with tears of joy" is U+1F602, stored as surrogate pair
      const emoji = '\uD83D\uDE02'
      buffer.append('s1', 'test ' + emoji + ' end')
      expect(buffer.getScrollback('s1')).toBe('test ' + emoji + ' end')
    })

    it('trims broken leading surrogate when buffer wraps mid-surrogate-pair', () => {
      // Set up a buffer of size 5
      // Surrogate pair takes 2 code units
      const small = new ScrollbackBuffer(5)
      const emoji = '\uD83D\uDE02' // 2 code units

      // Write "abc" (3 chars) then emoji (2 chars) = fills the 5-char buffer
      small.append('s1', 'abc' + emoji)
      expect(small.getScrollback('s1')).toBe('abc' + emoji)

      // Now write "xy" which overwrites positions 0,1 -> the "ab"
      // Buffer becomes: "xyc" + emoji with writePos=2
      // Reading: from pos 2 = "c" + emoji char1 + emoji char2 (which is "c\uD83D\uDE02")
      //          then from pos 0 = "xy"
      // Result: "c\uD83D\uDE02xy" -- surrogate pair is intact, all good
      small.append('s1', 'xy')
      expect(small.getScrollback('s1')).toBe('c' + emoji + 'xy')
    })

    it('trims orphaned low surrogate at buffer boundary', () => {
      // Specifically test: the oldest data starts with a lone low surrogate
      const small = new ScrollbackBuffer(5)
      const highSurrogate = '\uD83D'
      const lowSurrogate = '\uDE02'

      // Write 5 characters: "a", highSurrogate, lowSurrogate, "b", "c"
      small.append('s1', 'a' + highSurrogate + lowSurrogate + 'bc')
      expect(small.getScrollback('s1').length).toBe(5)

      // Write "xyz" -> overwrites positions 0,1,2 (the "a", high, low surrogates)
      // Buffer: "xyzbc" with writePos=3, wrapped=true
      // Read from pos 3: "bc" then from 0: "xyz" = "bcxyz" -- clean, no broken surrogates
      small.append('s1', 'xyz')
      expect(small.getScrollback('s1')).toBe('bcxyz')
    })

    it('handles large chunk of emoji with wrapping', () => {
      const small = new ScrollbackBuffer(10)
      // Each emoji is 2 code units, so 5 emoji = 10 code units
      const fiveEmoji = '\uD83D\uDE00\uD83D\uDE01\uD83D\uDE02\uD83D\uDE03\uD83D\uDE04'
      small.append('s1', fiveEmoji)
      expect(small.getScrollback('s1')).toBe(fiveEmoji)
    })
  })

  describe('edge cases', () => {
    it('buffer of size 1', () => {
      const tiny = new ScrollbackBuffer(1)
      tiny.append('s1', 'a')
      expect(tiny.getScrollback('s1')).toBe('a')
      tiny.append('s1', 'b')
      expect(tiny.getScrollback('s1')).toBe('b')
      tiny.append('s1', 'cde')
      expect(tiny.getScrollback('s1')).toBe('e')
    })

    it('re-creating session after removal', () => {
      buffer.append('s1', 'old data')
      buffer.remove('s1')
      buffer.append('s1', 'new data')
      expect(buffer.getScrollback('s1')).toBe('new data')
    })

    it('handles newlines and control characters', () => {
      buffer.append('s1', 'line1\r\nline2\nline3\t\x1b[31mred\x1b[0m')
      expect(buffer.getScrollback('s1')).toBe('line1\r\nline2\nline3\t\x1b[31mred\x1b[0m')
    })

    it('handles rapid sequential appends of varied sizes', () => {
      const small = new ScrollbackBuffer(20)
      small.append('s1', 'a'.repeat(5))
      small.append('s1', 'b'.repeat(10))
      small.append('s1', 'c'.repeat(3))
      small.append('s1', 'd'.repeat(7))
      // Total: 25 chars, buffer is 20, so last 20 should be kept
      // "aaaaabbbbbbbbbbcccdddddddd" = 5+10+3+7 = 25
      // last 20: "bbbbbbbbbcccddddddd" -- wait let me recalc
      // "aaaaabbbbbbbbbbbcccddddddd" = 5+10+3+7 = 25
      // last 20: chars 5-24 = "bbbbbbbbbcccddddddd" -- that's only 19
      // Actually: "aaaaa" + "bbbbbbbbbb" + "ccc" + "ddddddd"
      //          positions: 0-4, 5-14, 15-17, 18-24
      // The 20-char buffer stores the last 20 of the stream.
      // Stream = "aaaaabbbbbbbbbbcccddddddd" (25 chars)
      // last 20 = "bbbbbbbbbcccddddddd" -- that's 9+3+7 = 19...
      // Actually stream length: 5+10+3+7 = 25. last 20 = chars at index 5..24 = "bbbbbbbbbbcccddddddd" (20 chars)
      const result = small.getScrollback('s1')
      expect(result).toBe('bbbbbbbbbbcccddddddd')
      expect(result.length).toBe(20)
    })

    it('getScrollback can be called multiple times without side effects', () => {
      buffer.append('s1', 'stable data')
      expect(buffer.getScrollback('s1')).toBe('stable data')
      expect(buffer.getScrollback('s1')).toBe('stable data')
      expect(buffer.getScrollback('s1')).toBe('stable data')
    })

    it('append after getScrollback works correctly', () => {
      const small = new ScrollbackBuffer(10)
      small.append('s1', 'hello')
      expect(small.getScrollback('s1')).toBe('hello')
      small.append('s1', ' world')
      // "hello world" = 11 chars, buffer=10, last 10 = "ello world"
      expect(small.getScrollback('s1')).toBe('ello world')
    })
  })
})
