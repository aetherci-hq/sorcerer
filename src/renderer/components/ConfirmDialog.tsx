import React, { useEffect, useRef, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  details?: { label: string; value: string }[]
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  details,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button on open
  useEffect(() => {
    if (open) {
      setLoading(false)
      requestAnimationFrame(() => cancelRef.current?.focus())
    }
  }, [open])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content w-[420px] p-0 overflow-hidden">
          {/* Icon + header */}
          <div style={{ padding: '28px 28px 0 28px' }}>
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 40,
                  height: 40,
                  background: destructive
                    ? 'rgba(248, 113, 113, 0.1)'
                    : 'var(--accent-muted)',
                  marginTop: 1
                }}
              >
                {destructive ? (
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0V5zm.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
                      fill="var(--status-error)"
                    />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0V5zm.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
                      fill="var(--accent)"
                    />
                  </svg>
                )}
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-[13px] text-[var(--text-secondary)] leading-relaxed" style={{ marginTop: 6 }}>
                  {description}
                </AlertDialog.Description>
              </div>
            </div>
          </div>

          {/* Detail rows */}
          {details && details.length > 0 && (
            <div
              className="border border-[var(--border-subtle)] rounded-md"
              style={{ margin: '16px 28px 0 28px' }}
            >
              {details.map((d, i) => (
                <div
                  key={d.label}
                  className="flex items-center justify-between"
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined
                  }}
                >
                  <span className="text-[var(--text-muted)]">{d.label}</span>
                  <span className="text-[var(--text-secondary)] font-mono truncate" style={{ maxWidth: '60%', textAlign: 'right' }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div
            className="flex justify-end gap-2.5 border-t border-[var(--border)]"
            style={{ padding: '16px 28px', marginTop: 20 }}
          >
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="btn-ghost" disabled={loading}>
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className={destructive ? 'btn-danger' : 'btn-primary'}
                style={{ minWidth: 90 }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 16 16" className="animate-spin-slow" fill="currentColor">
                      <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 0 1 6-6V0z" />
                    </svg>
                    Working...
                  </span>
                ) : (
                  confirmLabel
                )}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
