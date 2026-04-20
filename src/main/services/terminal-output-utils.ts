const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g

export function sanitizeTerminalOutput(output: string): string {
  return output.replace(ANSI_PATTERN, '').replace(/\r/g, '')
}

export function getTerminalOutputTail(output: string, maxChars: number = 500): string | undefined {
  if (!output) return undefined
  const clean = sanitizeTerminalOutput(output)
  const tail = clean.length > maxChars ? clean.slice(-maxChars) : clean
  const trimmed = tail.trim()
  return trimmed || undefined
}
