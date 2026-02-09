import React, { useEffect } from 'react'
import { TileContainer } from './TileContainer'
import { disposeTerminal } from './TerminalView'
import { useTileStore } from '../stores/tile-store'
import { findLeaves } from '../lib/tile-utils'
import type { Session } from '../types'

interface TerminalPanelProps {
  sessions: Session[]
  activeSessionId: string | null
}

/**
 * Renders the tiled terminal layout.
 * When a tile tree exists, delegates to TileContainer for recursive rendering.
 * Cleans up terminals for deleted sessions.
 */
export function TerminalPanel({ sessions, activeSessionId }: TerminalPanelProps) {
  const tree = useTileStore((s) => s.tree)
  const removeSession = useTileStore((s) => s.removeSession)

  // Clean up tiles for sessions that no longer exist
  useEffect(() => {
    if (!tree) return
    const sessionIds = new Set(sessions.map((s) => s.id))
    const leaves = findLeaves(tree)
    for (const leaf of leaves) {
      if (!sessionIds.has(leaf.sessionId)) {
        disposeTerminal(leaf.sessionId)
        removeSession(leaf.sessionId)
      }
    }
  }, [sessions, tree, removeSession])

  if (!tree) return null

  return (
    <div className="absolute inset-0">
      <TileContainer node={tree} />
    </div>
  )
}
