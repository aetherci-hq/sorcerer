import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontalIcon } from './icons'

type PanelActionCommand = {
  label: string
  icon?: ReactNode
  action: () => void
  disabled?: boolean
  active?: boolean
}

export type PanelActionMenuItem = PanelActionCommand | { type: 'separator' }

interface PanelActionsMenuProps {
  items: PanelActionMenuItem[]
}

const isSeparator = (item: PanelActionMenuItem): item is { type: 'separator' } =>
  'type' in item && item.type === 'separator'

export function PanelActionsMenu({ items }: PanelActionsMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const actionableItems = items.filter((item) => !isSeparator(item))

  const updatePosition = () => {
    if (!open || !buttonRef.current || !menuRef.current) {
      setPos(null)
      return
    }

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const menuRect = menuRef.current.getBoundingClientRect()
    const pad = 8
    const maxHeight = Math.max(120, window.innerHeight - pad * 2)
    const clampedHeight = Math.min(menuRect.height, maxHeight)
    const left = Math.min(
      Math.max(pad, buttonRect.right - menuRect.width),
      Math.max(pad, window.innerWidth - menuRect.width - pad)
    )
    const top = Math.min(
      Math.max(pad, buttonRect.bottom + 4),
      Math.max(pad, window.innerHeight - clampedHeight - pad)
    )

    setPos({ top, left, maxHeight })
  }

  useLayoutEffect(() => {
    updatePosition()
  }, [open, items.length])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!menuRef.current) return
        const buttons = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('.context-menu-item:not(:disabled)'))
        if (buttons.length === 0) return
        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const nextIndex = event.key === 'ArrowDown'
          ? currentIndex >= 0 ? (currentIndex + 1) % buttons.length : 0
          : currentIndex >= 0 ? (currentIndex - 1 + buttons.length) % buttons.length : buttons.length - 1
        buttons[nextIndex]?.focus()
      }
    }

    const onResize = () => updatePosition()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('contextmenu', onPointerDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('contextmenu', onPointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open])

  if (actionableItems.length === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        className="split-panel-action"
        title="Panel actions"
        aria-label="Panel actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <MoreHorizontalIcon />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="context-menu panel-actions-menu"
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: -9999, left: -9999 }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item, index) => {
            if (isSeparator(item)) {
              return <div key={index} className="context-menu-separator" />
            }

            return (
              <button
                key={index}
                className={`context-menu-item ${item.active ? 'context-menu-item--active' : ''}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.action()
                }}
              >
                {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                <span className="context-menu-label">{item.label}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
