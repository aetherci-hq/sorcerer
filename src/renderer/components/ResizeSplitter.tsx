import React, { useCallback, useRef } from 'react'

interface ResizeSplitterProps {
  onResize: (deltaX: number) => void
  direction?: 'horizontal' | 'vertical'
}

export function ResizeSplitter({ onResize, direction = 'horizontal' }: ResizeSplitterProps) {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = pos - lastPos.current
      lastPos.current = pos
      onResize(delta)
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
  }, [onResize, direction])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`group relative flex-shrink-0 z-10 ${
        direction === 'horizontal'
          ? 'w-[3px] cursor-col-resize'
          : 'h-[3px] cursor-row-resize'
      }`}
    >
      {/* Visible indicator on hover */}
      <div className={`absolute transition-opacity opacity-0 group-hover:opacity-100 group-active:opacity-100 ${
        direction === 'horizontal'
          ? 'inset-y-0 left-0 right-0 bg-[var(--accent)]'
          : 'inset-x-0 top-0 bottom-0 bg-[var(--accent)]'
      }`} style={{ borderRadius: '1px' }} />
    </div>
  )
}
