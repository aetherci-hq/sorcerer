import { useState, useEffect, useRef, useCallback } from 'react'
import { getApi } from '../api/client'
import { SettingsIcon } from './icons'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'

/** MD5 hash for Gravatar URLs (pure JS, no dependencies) */
function md5(input: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff)
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    const r = safeAdd(safeAdd(a, q), safeAdd(x, t))
    return safeAdd((r << s) | (r >>> (32 - s)), b)
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s, t) }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s, t) }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t) }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t) }

  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i))
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const bitLen = input.length * 8
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0)

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476
  for (let i = 0; i < bytes.length; i += 64) {
    const m: number[] = []
    for (let j = 0; j < 16; j++) m.push(bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24))
    let aa = a, bb = b, cc = c, dd = d
    a = ff(a,b,c,d,m[0],7,-680876936); d = ff(d,a,b,c,m[1],12,-389564586); c = ff(c,d,a,b,m[2],17,606105819); b = ff(b,c,d,a,m[3],22,-1044525330)
    a = ff(a,b,c,d,m[4],7,-176418897); d = ff(d,a,b,c,m[5],12,1200080426); c = ff(c,d,a,b,m[6],17,-1473231341); b = ff(b,c,d,a,m[7],22,-45705983)
    a = ff(a,b,c,d,m[8],7,1770035416); d = ff(d,a,b,c,m[9],12,-1958414417); c = ff(c,d,a,b,m[10],17,-42063); b = ff(b,c,d,a,m[11],22,-1990404162)
    a = ff(a,b,c,d,m[12],7,1804603682); d = ff(d,a,b,c,m[13],12,-40341101); c = ff(c,d,a,b,m[14],17,-1502002290); b = ff(b,c,d,a,m[15],22,1236535329)
    a = gg(a,b,c,d,m[1],5,-165796510); d = gg(d,a,b,c,m[6],9,-1069501632); c = gg(c,d,a,b,m[11],14,643717713); b = gg(b,c,d,a,m[0],20,-373897302)
    a = gg(a,b,c,d,m[5],5,-701558691); d = gg(d,a,b,c,m[10],9,38016083); c = gg(c,d,a,b,m[15],14,-660478335); b = gg(b,c,d,a,m[4],20,-405537848)
    a = gg(a,b,c,d,m[9],5,568446438); d = gg(d,a,b,c,m[14],9,-1019803690); c = gg(c,d,a,b,m[3],14,-187363961); b = gg(b,c,d,a,m[8],20,1163531501)
    a = gg(a,b,c,d,m[13],5,-1444681467); d = gg(d,a,b,c,m[2],9,-51403784); c = gg(c,d,a,b,m[7],14,1735328473); b = gg(b,c,d,a,m[12],20,-1926607734)
    a = hh(a,b,c,d,m[5],4,-378558); d = hh(d,a,b,c,m[8],11,-2022574463); c = hh(c,d,a,b,m[11],16,1839030562); b = hh(b,c,d,a,m[14],23,-35309556)
    a = hh(a,b,c,d,m[1],4,-1530992060); d = hh(d,a,b,c,m[4],11,1272893353); c = hh(c,d,a,b,m[7],16,-155497632); b = hh(b,c,d,a,m[10],23,-1094730640)
    a = hh(a,b,c,d,m[13],4,681279174); d = hh(d,a,b,c,m[0],11,-358537222); c = hh(c,d,a,b,m[3],16,-722521979); b = hh(b,c,d,a,m[6],23,76029189)
    a = hh(a,b,c,d,m[9],4,-640364487); d = hh(d,a,b,c,m[12],11,-421815835); c = hh(c,d,a,b,m[15],16,530742520); b = hh(b,c,d,a,m[2],23,-995338651)
    a = ii(a,b,c,d,m[0],6,-198630844); d = ii(d,a,b,c,m[7],10,1126891415); c = ii(c,d,a,b,m[14],15,-1416354905); b = ii(b,c,d,a,m[5],21,-57434055)
    a = ii(a,b,c,d,m[12],6,1700485571); d = ii(d,a,b,c,m[3],10,-1894986606); c = ii(c,d,a,b,m[10],15,-1051523); b = ii(b,c,d,a,m[1],21,-2054922799)
    a = ii(a,b,c,d,m[8],6,1873313359); d = ii(d,a,b,c,m[15],10,-30611744); c = ii(c,d,a,b,m[6],15,-1560198380); b = ii(b,c,d,a,m[13],21,1309151649)
    a = ii(a,b,c,d,m[4],6,-145523070); d = ii(d,a,b,c,m[11],10,-1120210379); c = ii(c,d,a,b,m[2],15,718787259); b = ii(b,c,d,a,m[9],21,-343485551)
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd)
  }
  const hex = (n: number) => { let s = ''; for (let i = 0; i < 4; i++) s += ((n >> (i * 8 + 4)) & 0xf).toString(16) + ((n >> (i * 8)) & 0xf).toString(16); return s }
  return hex(a) + hex(b) + hex(c) + hex(d)
}

export function gravatarUrl(email: string, size = 64): string {
  const hash = md5(email.trim().toLowerCase())
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
}

export function useUserProfile() {
  const [displayName, setDisplayName] = useState('')
  const [initial, setInitial] = useState('')
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const custom = await getApi().settings.get('display_name')
      if (custom) {
        setDisplayName(custom)
        setInitial(custom.charAt(0).toUpperCase())
      } else {
        const info = await getApi().system.userInfo()
        const formatted = info.username.charAt(0).toUpperCase() + info.username.slice(1)
        setDisplayName(formatted)
        setInitial(formatted.charAt(0))
      }

      const email = await getApi().settings.get('gravatar_email')
      if (email) {
        const url = gravatarUrl(email, 96)
        const img = new Image()
        img.onload = () => setAvatarSrc(url)
        img.onerror = async () => {
          const sysPic = await getApi().system.accountPicture()
          if (sysPic) setAvatarSrc(sysPic)
        }
        img.src = url
      } else {
        const sysPic = await getApi().system.accountPicture()
        if (sysPic) setAvatarSrc(sysPic)
      }
    }
    load()

    const handler = () => load()
    window.addEventListener('sorcerer:profile-updated', handler)
    return () => window.removeEventListener('sorcerer:profile-updated', handler)
  }, [])

  return { displayName, initial, avatarSrc }
}

function useClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()

    const initialTimeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, msUntilNextMinute)

    return () => {
      clearTimeout(initialTimeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return { time, date }
}

function formatUptime(startTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - startTimestamp
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function StatsPopover({ sessions, onClose }: { sessions: any[]; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Today boundary (midnight local time) in unix seconds
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const todaySessions = sessions.filter((s) => s.created_at && s.created_at >= todayStart)

  // Earliest active session today for "running since"
  const earliestActive = activeSessions
    .filter((s) => s.created_at && s.created_at >= todayStart)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))[0]

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay listener to avoid immediate close from the click that opened it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="stats-popover" ref={popoverRef}>
      <div className="stats-popover-header">Today's Activity</div>
      <div className="stats-popover-grid">
        <div className="stats-popover-stat">
          <span className="stats-popover-value">{activeSessions.length}</span>
          <span className="stats-popover-label">Active now</span>
        </div>
        <div className="stats-popover-stat">
          <span className="stats-popover-value">{todaySessions.length}</span>
          <span className="stats-popover-label">Created today</span>
        </div>
      </div>
      {earliestActive && (
        <div className="stats-popover-uptime">
          <span className="stats-popover-uptime-label">Running since</span>
          <span className="stats-popover-uptime-value">
            {formatTime(earliestActive.created_at)} ({formatUptime(earliestActive.created_at)})
          </span>
        </div>
      )}
    </div>
  )
}

export function SidebarFooter({ collapsed, width = 260 }: { collapsed: boolean; width?: number }) {
  const sessions = useSessionStore((s) => s.sessions)
  const openDialog = useUIStore((s) => s.openDialog)
  const { displayName, initial, avatarSrc } = useUserProfile()
  const { time, date } = useClock()
  const [showStats, setShowStats] = useState(false)

  const activeCount = sessions.filter((s) => s.status === 'active').length

  // Activity level for presence ring: 0 = none, 1 = low, 2 = high
  const activityLevel = activeCount === 0 ? 0 : activeCount <= 2 ? 1 : 2

  // Responsive breakpoints based on sidebar width
  const showClock = width >= 280
  const showClockDate = width >= 320
  const showStatus = width >= 230
  const compact = width < 220

  const handleCloseStats = useCallback(() => setShowStats(false), [])

  if (collapsed) {
    return (
      <div className="sidebar-footer sidebar-footer--collapsed stagger-10">
        <button className="footer-settings-btn" onClick={() => openDialog('settings')}>
          <SettingsIcon />
        </button>
      </div>
    )
  }

  return (
    <div className={`sidebar-footer stagger-10${compact ? ' sidebar-footer--compact' : ''}`}>
      {showStats && <StatsPopover sessions={sessions} onClose={handleCloseStats} />}
      <button
        className="avatar-ring-btn"
        data-activity={activityLevel}
        onClick={() => setShowStats(!showStats)}
        aria-label="Toggle session stats"
      >
        <span className="avatar-ring" />
        {avatarSrc ? (
          <img className="user-avatar user-avatar--img" src={avatarSrc} alt={displayName} />
        ) : (
          <div className="user-avatar">{initial}</div>
        )}
      </button>
      <div className="user-info">
        <div className="user-name">{displayName}</div>
        {showStatus && (
          <div className="user-status">
            <span className="user-status-dot" />
            {activeCount} session{activeCount !== 1 ? 's' : ''} active
          </div>
        )}
      </div>
      {showClock && (
        <div className="footer-clock">
          <span className="footer-clock-time">{time}</span>
          {showClockDate && <span className="footer-clock-date">{date}</span>}
        </div>
      )}
      <button className="footer-settings-btn" onClick={() => openDialog('settings')}>
        <SettingsIcon />
      </button>
    </div>
  )
}
