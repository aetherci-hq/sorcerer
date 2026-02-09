import React, { useCallback, useRef, useEffect } from 'react'
import { TerminalView } from './TerminalView'
import { useTileStore } from '../stores/tile-store'
import { useSessionStore } from '../stores/session-store'
import { useProjectStore } from '../stores/project-store'
import type { TileNode } from '../lib/tile-utils'

interface TileContainerProps {
  node: TileNode
}

export function TileContainer({ node }: TileContainerProps) {
  if (node.type === 'leaf') {
    return <TileLeafView node={node} />
  }
  return <TileSplitView node={node} />
}

function TileLeafView({ node }: { node: Extract<TileNode, { type: 'leaf' }> }) {
  const focusedTileId = useTileStore((s) => s.focusedTileId)
  const setFocus = useTileStore((s) => s.setFocus)
  const close = useTileStore((s) => s.close)
  const isFocused = focusedTileId === node.id
  const leafCount = useTileStore((s) => (s.tree ? countLeaves(s.tree) : 1))
  const isSplit = leafCount > 1

  // Look up session + project name
  const sessionName = useSessionStore((s) => {
    const session = s.sessions.find((sess) => sess.id === node.sessionId)
    return session?.name ?? node.sessionId.slice(0, 8)
  })
  const projectName = useSessionStore((s) => {
    const session = s.sessions.find((sess) => sess.id === node.sessionId)
    return session?.project_id ?? null
  })
  const projectLabel = useProjectStore((s) => {
    if (!projectName) return null
    const project = s.projects.find((p) => p.id === projectName)
    return project?.name ?? null
  })

  return (
    <div
      className="relative w-full h-full min-w-0 min-h-0 flex flex-col"
      onMouseDown={() => {
        if (!isFocused) setFocus(node.id)
      }}
    >
      {/* Pane header — only shown when split */}
      {isSplit && (
        <div
          className="flex items-center justify-between flex-shrink-0 border-b"
          style={{
            height: 28,
            paddingLeft: 10,
            paddingRight: 6,
            background: isFocused ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
            borderColor: isFocused ? 'var(--accent)' : 'var(--border)',
            borderBottomWidth: 1,
            opacity: isFocused ? 1 : 0.7,
            transition: 'all 150ms ease'
          }}
        >
          <span className="text-[11px] truncate flex items-center gap-0">
            {projectLabel && (
              <>
                <span style={{ color: 'var(--text-faint)' }}>{projectLabel}</span>
                <span style={{ color: 'var(--text-faint)', margin: '0 5px' }}>/</span>
              </>
            )}
            <span
              className="font-medium"
              style={{ color: isFocused ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {sessionName}
            </span>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              close(node.id)
            }}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
            title="Close pane (Ctrl+W)"
          >
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>
      )}
      {/* Terminal */}
      <div className="flex-1 min-h-0 relative">
        <TerminalView sessionId={node.sessionId} isFocused={isFocused} />
      </div>
    </div>
  )
}

function countLeaves(node: TileNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.first) + countLeaves(node.second)
}

function TileSplitView({ node }: { node: Extract<TileNode, { type: 'split' }> }) {
  const resize = useTileStore((s) => s.resize)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use a ref so the drag handler always reads the latest ratio
  const ratioRef = useRef(node.ratio)
  useEffect(() => {
    ratioRef.current = node.ratio
  }, [node.ratio])

  const nodeIdRef = useRef(node.id)
  nodeIdRef.current = node.id

  const handleSplitterDrag = useCallback(
    (delta: number) => {
      const container = containerRef.current
      if (!container) return

      const totalSize =
        node.direction === 'horizontal'
          ? container.offsetWidth
          : container.offsetHeight

      if (totalSize === 0) return
      const ratioDelta = delta / totalSize
      const newRatio = ratioRef.current + ratioDelta
      resize(nodeIdRef.current, newRatio)
    },
    [node.direction, resize]
  )

  const isHorizontal = node.direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className="flex w-full h-full min-w-0 min-h-0"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{
          flex: `0 0 calc(${node.ratio * 100}% - 2px)`
        }}
      >
        <TileContainer node={node.first} />
      </div>
      <TileSplitter direction={node.direction} onDrag={handleSplitterDrag} />
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{
          flex: `0 0 calc(${(1 - node.ratio) * 100}% - 2px)`
        }}
      >
        <TileContainer node={node.second} />
      </div>
    </div>
  )
}

function TileSplitter({
  direction,
  onDrag
}: {
  direction: 'horizontal' | 'vertical'
  onDrag: (delta: number) => void
}) {
  const dragging = useRef(false)
  const lastPos = useRef(0)
  // Keep a ref to always call the latest onDrag (avoids stale closure in mousemove)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return
        const pos = direction === 'horizontal' ? e.clientX : e.clientY
        const delta = pos - lastPos.current
        lastPos.current = pos
        onDragRef.current(delta)
      }

      const handleMouseUp = () => {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [direction]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`group relative flex-shrink-0 z-10 ${
        direction === 'horizontal'
          ? 'w-[4px] cursor-col-resize'
          : 'h-[4px] cursor-row-resize'
      }`}
      style={{ background: 'var(--border)' }}
    >
      <div
        className={`absolute transition-opacity opacity-0 group-hover:opacity-100 group-active:opacity-100 ${
          direction === 'horizontal'
            ? 'inset-y-0 left-0 right-0 bg-[var(--accent)]'
            : 'inset-x-0 top-0 bottom-0 bg-[var(--accent)]'
        }`}
      />
    </div>
  )
}
