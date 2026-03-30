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

const NORD_THEME: SorcererTheme = {
  id: 'nord',
  name: 'Nord',
  colors: {
    'bg-root': '#2e3440',
    'bg-sidebar': '#272c36',
    'bg-titlebar': '#272c36',
    'bg-hover': '#3b4252',
    'bg-active': '#434c5e',
    'bg-elevated': '#3b4252',
    'terminal-bg': '#2e3440',
    'border-subtle': '#3b4252',
    'border-medium': '#434c5e',
    'text-primary': '#eceff4',
    'text-secondary': '#d8dee9',
    'text-tertiary': '#7b88a1',
    'text-muted': '#4c566a',
    'accent': '#88c0d0',
    'accent-dim': '#6ba8b8',
    'accent-glow': 'rgba(136, 192, 208, 0.12)',
    'accent-glow-strong': 'rgba(136, 192, 208, 0.22)',
    'danger': '#bf616a'
  },
  terminal: {
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selectionBackground: '#434c5e99',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  }
}

const DRACULA_THEME: SorcererTheme = {
  id: 'dracula',
  name: 'Dracula',
  colors: {
    'bg-root': '#282a36',
    'bg-sidebar': '#21222c',
    'bg-titlebar': '#21222c',
    'bg-hover': '#343746',
    'bg-active': '#44475a',
    'bg-elevated': '#343746',
    'terminal-bg': '#282a36',
    'border-subtle': '#343746',
    'border-medium': '#44475a',
    'text-primary': '#f8f8f2',
    'text-secondary': '#ccc5e0',
    'text-tertiary': '#6272a4',
    'text-muted': '#44475a',
    'accent': '#bd93f9',
    'accent-dim': '#9a6ff0',
    'accent-glow': 'rgba(189, 147, 249, 0.12)',
    'accent-glow-strong': 'rgba(189, 147, 249, 0.22)',
    'danger': '#ff5555'
  },
  terminal: {
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selectionBackground: '#44475a99',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  }
}

const CATPPUCCIN_MOCHA_THEME: SorcererTheme = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  colors: {
    'bg-root': '#1e1e2e',
    'bg-sidebar': '#181825',
    'bg-titlebar': '#181825',
    'bg-hover': '#2a2b3d',
    'bg-active': '#313244',
    'bg-elevated': '#252637',
    'terminal-bg': '#1e1e2e',
    'border-subtle': '#2a2b3d',
    'border-medium': '#313244',
    'text-primary': '#cdd6f4',
    'text-secondary': '#bac2de',
    'text-tertiary': '#6c7086',
    'text-muted': '#45475a',
    'accent': '#cba6f7',
    'accent-dim': '#b08bdb',
    'accent-glow': 'rgba(203, 166, 247, 0.12)',
    'accent-glow-strong': 'rgba(203, 166, 247, 0.22)',
    'danger': '#f38ba8'
  },
  terminal: {
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#31324499',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8'
  }
}

const GRUVBOX_DARK_THEME: SorcererTheme = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Dark',
  colors: {
    'bg-root': '#282828',
    'bg-sidebar': '#1d2021',
    'bg-titlebar': '#1d2021',
    'bg-hover': '#3c3836',
    'bg-active': '#504945',
    'bg-elevated': '#3c3836',
    'terminal-bg': '#282828',
    'border-subtle': '#3c3836',
    'border-medium': '#504945',
    'text-primary': '#ebdbb2',
    'text-secondary': '#d5c4a1',
    'text-tertiary': '#7c6f64',
    'text-muted': '#504945',
    'accent': '#fabd2f',
    'accent-dim': '#d79921',
    'accent-glow': 'rgba(250, 189, 47, 0.12)',
    'accent-glow-strong': 'rgba(250, 189, 47, 0.22)',
    'danger': '#fb4934'
  },
  terminal: {
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    selectionBackground: '#50494599',
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#ebdbb2'
  }
}

export const THEMES: Record<string, SorcererTheme> = {
  default: DEFAULT_THEME,
  aetherci: AETHERCI_THEME,
  'kimbie-dark': KIMBIE_DARK_THEME,
  'night-owl': NIGHT_OWL_THEME,
  'tokyo-night': TOKYO_NIGHT_THEME,
  nord: NORD_THEME,
  dracula: DRACULA_THEME,
  'catppuccin-mocha': CATPPUCCIN_MOCHA_THEME,
  'gruvbox-dark': GRUVBOX_DARK_THEME
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
