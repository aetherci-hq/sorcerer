import { useRef, useEffect } from 'react'

interface ParticleCanvasProps {
  /** Number of particles (default: scaled to container area) */
  count?: number
  /** Particle color — defaults to CSS --accent, updates on theme change */
  color?: string
  className?: string
}

export function ParticleCanvas({ count, color, className }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let particles: Particle[] = []
    let activeColor = color || getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#e2a445'

    // Re-read --accent when the theme changes
    const onThemeChange = () => {
      if (!color) {
        activeColor = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#e2a445'
      }
    }
    window.addEventListener('sorcerer:themeChange', onThemeChange)

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      ctx!.scale(dpr, dpr)
    }

    class Particle {
      x = 0; y = 0; size = 0; speedY = 0; drift = 0
      opacity = 0; maxOpacity = 0; fadeIn = true
      life = 0; maxLife = 0; wobbleSpeed = 0; wobbleAmp = 0

      reset() {
        const rect = canvas!.getBoundingClientRect()
        this.x = Math.random() * rect.width
        this.y = rect.height + Math.random() * 60
        this.size = Math.random() * 1.5 + 0.4
        this.speedY = -(Math.random() * 0.4 + 0.1)
        this.drift = (Math.random() - 0.5) * 0.2
        this.opacity = 0
        this.maxOpacity = Math.random() * 0.4 + 0.1
        this.fadeIn = true
        this.life = 0
        this.maxLife = Math.random() * 500 + 250
        this.wobbleSpeed = Math.random() * 0.02 + 0.005
        this.wobbleAmp = Math.random() * 15 + 8
      }

      update() {
        this.life++
        this.y += this.speedY
        this.x += this.drift + Math.sin(this.life * this.wobbleSpeed) * 0.2
        if (this.fadeIn && this.opacity < this.maxOpacity) {
          this.opacity += 0.004
          if (this.opacity >= this.maxOpacity) this.fadeIn = false
        }
        if (this.life > this.maxLife * 0.7) {
          this.opacity -= 0.002
        }
        if (this.opacity <= 0 || this.y < -10) this.reset()
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save()
        ctx.globalAlpha = Math.max(0, this.opacity)
        ctx.fillStyle = activeColor
        ctx.shadowColor = activeColor
        ctx.shadowBlur = this.size * 3
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    function init() {
      resize()
      const rect = canvas!.getBoundingClientRect()
      const area = rect.width * rect.height
      const n = count ?? Math.max(8, Math.floor(area / 12000))
      particles = []
      for (let i = 0; i < n; i++) {
        const p = new Particle()
        p.reset()
        // Scatter initial positions across the canvas
        p.y = Math.random() * rect.height
        p.life = Math.random() * p.maxLife * 0.5
        p.opacity = p.maxOpacity * 0.5
        p.fadeIn = false
        particles.push(p)
      }
    }

    function animate() {
      const rect = canvas!.getBoundingClientRect()
      ctx!.clearRect(0, 0, rect.width, rect.height)
      for (const p of particles) {
        p.update()
        p.draw(ctx!)
      }
      raf = requestAnimationFrame(animate)
    }

    init()
    animate()

    const ro = new ResizeObserver(() => {
      resize()
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('sorcerer:themeChange', onThemeChange)
    }
  }, [count, color])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
    />
  )
}
