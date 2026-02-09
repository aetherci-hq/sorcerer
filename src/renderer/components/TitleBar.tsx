import React from 'react'

export function TitleBar() {
  return (
    <div
      className="flex items-center h-[52px] bg-[var(--bg-primary)] border-b border-[var(--border)] select-none pr-[140px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5" style={{ paddingLeft: 24, paddingRight: 16 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--accent)]">
          <path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="8" cy="8" r="2.5" fill="currentColor" />
        </svg>
        <span className="text-[var(--accent)] font-semibold text-[14px] tracking-widest uppercase">
          Sorcerer
        </span>
      </div>
    </div>
  )
}
