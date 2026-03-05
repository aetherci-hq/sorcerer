// Theme infrastructure for Sorcerer
// Colors map 1:1 to CSS custom properties; terminal colors are xterm.js ANSI palette values.

export interface SorcererThemeColors {
  'bg-root': string
  'bg-sidebar': string
  'bg-titlebar': string
  'bg-hover': string
  'bg-active': string
  'bg-elevated': string
  'terminal-bg': string
  'border-subtle': string
  'border-medium': string
  'text-primary': string
  'text-secondary': string
  'text-tertiary': string
  'text-muted': string
  'accent': string
  'accent-dim': string
  'accent-glow': string
  'accent-glow-strong': string
  'danger': string
}

export interface SorcererTerminalColors {
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface SorcererTheme {
  id: string
  name: string
  colors: SorcererThemeColors
  terminal: SorcererTerminalColors
}

export const DEFAULT_THEME: SorcererTheme = {
  id: 'default',
  name: 'Sorcerer Dark',
  colors: {
    'bg-root': '#0f0e0c',
    'bg-sidebar': '#0b0a08',
    'bg-titlebar': '#1a1714',
    'bg-hover': '#231f19',
    'bg-active': '#2a261e',
    'bg-elevated': '#282420',
    'terminal-bg': '#0f0e0c',
    'border-subtle': '#2a261e',
    'border-medium': '#3a342a',
    'text-primary': '#ede6d8',
    'text-secondary': '#a69e8e',
    'text-tertiary': '#6b6355',
    'text-muted': '#4a4540',
    'accent': '#e2a445',
    'accent-dim': '#c48a2a',
    'accent-glow': 'rgba(226, 164, 69, 0.12)',
    'accent-glow-strong': 'rgba(226, 164, 69, 0.22)',
    'danger': '#e25555'
  },
  terminal: {
    foreground: '#ede6d8',
    cursor: '#e2a445',
    selectionBackground: '#e2a44533',
    black: '#0f0e0c',
    red: '#e25555',
    green: '#5ec269',
    yellow: '#e2a445',
    blue: '#5ba4e6',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#ede6d8',
    brightBlack: '#6b6355',
    brightRed: '#f87171',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff'
  }
}

const AETHERCI_THEME: SorcererTheme = {
  id: 'aetherci',
  name: 'AetherCI',
  colors: {
    'bg-root': '#060606',
    'bg-sidebar': '#0a0a0a',
    'bg-titlebar': '#0a0a0a',
    'bg-hover': '#1a1a1a',
    'bg-active': '#222222',
    'bg-elevated': '#121212',
    'terminal-bg': '#060606',
    'border-subtle': 'rgba(255, 255, 255, 0.10)',
    'border-medium': 'rgba(255, 255, 255, 0.15)',
    'text-primary': '#ffffff',
    'text-secondary': '#9ca3af',
    'text-tertiary': '#6b7280',
    'text-muted': '#4b5563',
    'accent': '#00ff88',
    'accent-dim': '#00cc6a',
    'accent-glow': 'rgba(0, 255, 136, 0.10)',
    'accent-glow-strong': 'rgba(0, 255, 136, 0.20)',
    'danger': '#db504a'
  },
  terminal: {
    foreground: '#d1d5db',
    cursor: '#00ff88',
    selectionBackground: 'rgba(0, 255, 136, 0.15)',
    black: '#060606',
    red: '#db504a',
    green: '#00ff88',
    yellow: '#eca400',
    blue: '#3b82f6',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#d1d5db',
    brightBlack: '#6b7280',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff'
  }
}

export const THEMES: Record<string, SorcererTheme> = {
  default: DEFAULT_THEME,
  aetherci: AETHERCI_THEME
}

export function getThemeById(id: string): SorcererTheme {
  return THEMES[id] ?? DEFAULT_THEME
}

export function applyTheme(theme: SorcererTheme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value)
  }
  // Update native title bar buttons to match the theme (Windows/Linux)
  window.sorcerer?.window.setTitleBarOverlay({
    color: theme.colors['bg-titlebar'],
    symbolColor: theme.colors['text-secondary']
  })
  window.dispatchEvent(new CustomEvent('sorcerer:themeChange', { detail: theme }))
}
