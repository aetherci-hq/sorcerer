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

const KIMBIE_DARK_THEME: SorcererTheme = {
  id: 'kimbie-dark',
  name: 'Kimbie Dark',
  colors: {
    'bg-root': '#221a0f',
    'bg-sidebar': '#1a1308',
    'bg-titlebar': '#362712',
    'bg-hover': '#3a2a16',
    'bg-active': '#7c5021',
    'bg-elevated': '#362712',
    'terminal-bg': '#221a0f',
    'border-subtle': '#3a2a16',
    'border-medium': '#5a4020',
    'text-primary': '#d3af86',
    'text-secondary': '#a8875c',
    'text-tertiary': '#7e6545',
    'text-muted': '#5a4a35',
    'accent': '#a57a4c',
    'accent-dim': '#8a6540',
    'accent-glow': 'rgba(165, 122, 76, 0.12)',
    'accent-glow-strong': 'rgba(165, 122, 76, 0.22)',
    'danger': '#f48771'
  },
  terminal: {
    foreground: '#d3af86',
    cursor: '#d3af86',
    selectionBackground: '#a57a4c33',
    black: '#221a0f',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  }
}

const NIGHT_OWL_THEME: SorcererTheme = {
  id: 'night-owl',
  name: 'Night Owl',
  colors: {
    'bg-root': '#011627',
    'bg-sidebar': '#011627',
    'bg-titlebar': '#011627',
    'bg-hover': '#0b2942',
    'bg-active': '#234d708c',
    'bg-elevated': '#021320',
    'terminal-bg': '#011627',
    'border-subtle': '#122d42',
    'border-medium': '#5f7e97',
    'text-primary': '#d6deeb',
    'text-secondary': '#7fdbca',
    'text-tertiary': '#5f7e97',
    'text-muted': '#44596b',
    'accent': '#7e57c2',
    'accent-dim': '#6943a5',
    'accent-glow': 'rgba(126, 87, 194, 0.12)',
    'accent-glow-strong': 'rgba(126, 87, 194, 0.22)',
    'danger': '#ef5350'
  },
  terminal: {
    foreground: '#d6deeb',
    cursor: '#80a4c2',
    selectionBackground: '#1b90dd4d',
    black: '#011627',
    red: '#ef5350',
    green: '#22da6e',
    yellow: '#c5e478',
    blue: '#82aaff',
    magenta: '#c792ea',
    cyan: '#21c7a8',
    white: '#ffffff',
    brightBlack: '#575656',
    brightRed: '#ef5350',
    brightGreen: '#22da6e',
    brightYellow: '#ffeb95',
    brightBlue: '#82aaff',
    brightMagenta: '#c792ea',
    brightCyan: '#7fdbca',
    brightWhite: '#ffffff'
  }
}

const TOKYO_NIGHT_THEME: SorcererTheme = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  colors: {
    'bg-root': '#1a1b26',
    'bg-sidebar': '#16161e',
    'bg-titlebar': '#16161e',
    'bg-hover': '#1f2030',
    'bg-active': '#202330',
    'bg-elevated': '#1e1f2b',
    'terminal-bg': '#1a1b26',
    'border-subtle': '#101014',
    'border-medium': '#292e42',
    'text-primary': '#c0caf5',
    'text-secondary': '#a9b1d6',
    'text-tertiary': '#565f89',
    'text-muted': '#3b3f52',
    'accent': '#7aa2f7',
    'accent-dim': '#3d59a1',
    'accent-glow': 'rgba(122, 162, 247, 0.10)',
    'accent-glow-strong': 'rgba(122, 162, 247, 0.20)',
    'danger': '#f7768e'
  },
  terminal: {
    foreground: '#a9b1d6',
    cursor: '#c0caf5',
    selectionBackground: '#515c7e4d',
    black: '#363b54',
    red: '#f7768e',
    green: '#73daca',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#787c99',
    brightBlack: '#363b54',
    brightRed: '#f7768e',
    brightGreen: '#73daca',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#acb0d0'
  }
}

export const THEMES: Record<string, SorcererTheme> = {
  default: DEFAULT_THEME,
  aetherci: AETHERCI_THEME,
  'kimbie-dark': KIMBIE_DARK_THEME,
  'night-owl': NIGHT_OWL_THEME,
  'tokyo-night': TOKYO_NIGHT_THEME
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
    color: theme.colors['bg-root'],
    symbolColor: theme.colors['text-secondary']
  })
  // Broadcast theme to pop-out windows
  window.sorcerer?.popout.broadcastTheme(theme.id)
  window.dispatchEvent(new CustomEvent('sorcerer:themeChange', { detail: theme }))
}
