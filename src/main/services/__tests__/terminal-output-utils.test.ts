import { describe, expect, it } from 'vitest'
import { getTerminalOutputTail, sanitizeTerminalOutput } from '../terminal-output-utils'

describe('terminal-output-utils', () => {
  describe('sanitizeTerminalOutput', () => {
    it('removes ANSI sequences and carriage returns', () => {
      const raw = 'line1\r\nline2 \x1b[31mred\x1b[0m'
      expect(sanitizeTerminalOutput(raw)).toBe('line1\nline2 red')
    })
  })

  describe('getTerminalOutputTail', () => {
    it('returns undefined for empty output', () => {
      expect(getTerminalOutputTail('')).toBeUndefined()
    })

    it('returns a trimmed clean tail when output fits in the limit', () => {
      const raw = '\n  hello \x1b[32mworld\x1b[0m  \r\n'
      expect(getTerminalOutputTail(raw, 100)).toBe('hello world')
    })

    it('keeps only the trailing characters after cleaning', () => {
      const raw = 'prefix\nimportant failure details here'
      expect(getTerminalOutputTail(raw, 12)).toBe('details here')
    })

    it('applies the limit after ANSI stripping', () => {
      const raw = '12345\x1b[31m67890\x1b[0m'
      expect(getTerminalOutputTail(raw, 5)).toBe('67890')
    })
  })
})
