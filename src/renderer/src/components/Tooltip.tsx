import { useState, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TooltipPosition = 'bottom' | 'top' | 'left' | 'right'

interface TooltipProps {
  label: string
  position?: TooltipPosition
  children: ReactNode
}

export function Tooltip({ label, position = 'bottom', children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const gap = 6

      let top: number
      let left: number

      switch (position) {
        case 'top':
          top = rect.top - gap
          left = rect.left + rect.width / 2
          break
        case 'left':
          top = rect.top + rect.height / 2
          left = rect.left - gap
          break
        case 'right':
          top = rect.top + rect.height / 2
          left = rect.right + gap
          break
        case 'bottom':
        default:
          top = rect.bottom + gap
          left = rect.left + rect.width / 2
          break
      }

      setCoords({ top, left })
      setVisible(true)
    }, 150)
  }, [position])

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }, [])

  return (
    <>
      <span
        className="tooltip-wrapper"
        ref={wrapperRef}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {visible && createPortal(
        <div
          className={`tooltip-portal tooltip-portal--${position}`}
          style={{ top: coords.top, left: coords.left }}
        >
          {label}
        </div>,
        document.body
      )}
    </>
  )
}
