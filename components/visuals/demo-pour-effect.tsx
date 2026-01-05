"use client"

import { useEffect, useRef, useState } from "react"

interface PourEvent {
  id: string
  timestamp: number
  x: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  color: string
  life: number
  maxLife: number
}

interface DemoPourEffectProps {
  trigger: number
  tokenSymbol: string
}

export function DemoPourEffect({ trigger, tokenSymbol }: DemoPourEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(0)
  const [notification, setNotification] = useState<PourEvent | null>(null)

  // Create particles for pour event
  const createPourParticles = (x: number) => {
    const particles = particlesRef.current
    const count = 120

    const colors = ["#14b8a6", "#0d9488", "#0f766e", "#2dd4bf", "#5eead4", "#22c55e", "#4ade80"]

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.6 - Math.PI / 2
      const speed = Math.random() * 5 + 3
      const life = Math.random() * 140 + 100

      particles.push({
        x: x + (Math.random() - 0.5) * 80,
        y: -20,
        vx: Math.cos(angle) * speed * (Math.random() * 0.5 + 0.5),
        vy: Math.sin(angle) * speed + Math.random() * 2,
        size: Math.random() * 7 + 4,
        opacity: Math.random() * 0.7 + 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: life,
        maxLife: life,
      })
    }
  }

  // Trigger pour effect when trigger changes
  useEffect(() => {
    if (trigger === 0) return

    const x = Math.random() * (window.innerWidth - 400) + 200
    createPourParticles(x)

    const pourEvent: PourEvent = {
      id: Math.random().toString(36),
      timestamp: Date.now(),
      x,
    }

    setNotification(pourEvent)

    setTimeout(() => {
      setNotification(null)
    }, 5000)
  }, [trigger])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const particles = particlesRef.current

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]

        p.vy += 0.2 // gravity
        p.vx *= 0.98 // air resistance
        p.x += p.vx
        p.y += p.vy
        p.life -= 1

        const lifeRatio = p.life / p.maxLife
        p.opacity = lifeRatio * 0.9

        if (p.life <= 0 || p.y > canvas.height + 50) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.globalAlpha = p.opacity

        // Outer glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(0.3, p.color + "90")
        gradient.addColorStop(0.7, p.color + "40")
        gradient.addColorStop(1, "transparent")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()

        // Highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
        ctx.beginPath()
        ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.4, 0, Math.PI * 2)
        ctx.fill()

        // Water trail for falling droplets
        if (p.vy > 2) {
          ctx.strokeStyle = p.color + "50"
          ctx.lineWidth = p.size * 0.6
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4)
          ctx.stroke()
        }

        ctx.restore()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" style={{ mixBlendMode: "screen" }} />

      {notification && (
        <div className="fixed top-24 right-4 z-50 pointer-events-none">
          <div className="glass-panel-elevated rounded-xl px-5 py-4 flex items-center gap-4 animate-in slide-in-from-right-full fade-in duration-500 shadow-2xl border border-[var(--aqua-primary)]/20">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--aqua-primary)]/30 to-[var(--aqua-primary)]/10 relative overflow-hidden">
              {/* Animated ripple effect */}
              <div className="absolute inset-0 animate-ping opacity-20 bg-[var(--aqua-primary)] rounded-xl" />

              {/* Aquarius water drop icon */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[var(--aqua-primary)] relative z-10"
              >
                <path
                  d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2Z"
                  fill="currentColor"
                />
                <path
                  d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-[var(--text-primary)] mb-0.5">
                <span className="text-[var(--aqua-primary)] aqua-text-glow">Creator POUR</span>
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--aqua-primary)]">{tokenSymbol}</span>
                {" · "}
                <span className="text-green-400">+2.5 SOL</span> Liquidity Added
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-[var(--aqua-primary)]/20 to-green-500/20 text-[var(--aqua-primary)] border border-[var(--aqua-primary)]/30">
                POUR
              </div>
              <span className="text-[10px] text-[var(--text-dim)]">Just now</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
