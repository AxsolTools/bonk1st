"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface PourEvent {
  id: string
  tokenSymbol: string
  tokenName: string
  amount: number
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

export function GlobalPourEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(0)
  const [notifications, setNotifications] = useState<PourEvent[]>([])

  // Create particles for pour event
  const createPourParticles = useCallback((x: number, amount: number) => {
    const particles = particlesRef.current
    const count = Math.min(100, Math.floor(amount * 40) + 30)

    const colors = ["#14b8a6", "#0d9488", "#0f766e", "#2dd4bf", "#5eead4", "#22c55e", "#4ade80"]

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.6 - Math.PI / 2
      const speed = Math.random() * 4 + 2
      const life = Math.random() * 120 + 80

      particles.push({
        x: x + (Math.random() - 0.5) * 60,
        y: -20,
        vx: Math.cos(angle) * speed * (Math.random() * 0.5 + 0.5),
        vy: Math.sin(angle) * speed + Math.random() * 2,
        size: Math.random() * 6 + 3,
        opacity: Math.random() * 0.6 + 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: life,
        maxLife: life,
      })
    }
  }, [])

  // Subscribe to real-time trades - ONLY show POUR events (creator wallet buys)
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel("global-pour-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, async (payload) => {
        const trade = payload.new as {
          token_id: string
          wallet_address: string
          type: string
          amount_sol: number
        }

        // Only process BUY trades
        if (trade.type !== "buy") return

        // Get token info including creator_wallet to check if this is a POUR
        const { data: tokenData } = await supabase
          .from("tokens")
          .select("symbol, name, creator_wallet")
          .eq("id", trade.token_id)
          .single()

        if (!tokenData) return

        const isCreatorPour = trade.wallet_address?.toLowerCase() === tokenData.creator_wallet?.toLowerCase()

        if (!isCreatorPour) return // Skip non-pour trades

        const amount = Number(trade.amount_sol) || 0.1
        const x = Math.random() * (window.innerWidth - 200) + 100

        // Create pour particles
        createPourParticles(x, amount)

        // Add notification
        const notification: PourEvent = {
          id: Math.random().toString(36),
          tokenSymbol: tokenData.symbol || "TOKEN",
          tokenName: tokenData.name || "Unknown",
          amount,
          timestamp: Date.now(),
          x,
        }

        setNotifications((prev) => [notification, ...prev].slice(0, 5))

        // Remove notification after animation
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
        }, 4000)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [createPourParticles])

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

        // Physics
        p.vy += 0.15 // gravity
        p.vx *= 0.99 // air resistance
        p.x += p.vx
        p.y += p.vy
        p.life -= 1

        const lifeRatio = p.life / p.maxLife
        p.opacity = lifeRatio * 0.8

        if (p.life <= 0 || p.y > canvas.height + 50) {
          particles.splice(i, 1)
          continue
        }

        // Draw particle with glow
        ctx.save()
        ctx.globalAlpha = p.opacity

        // Outer glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(0.4, p.color + "80")
        gradient.addColorStop(1, "transparent")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()

        // Highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
        ctx.beginPath()
        ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2)
        ctx.fill()

        // Trail for falling water
        if (p.vy > 1) {
          ctx.strokeStyle = p.color + "40"
          ctx.lineWidth = p.size * 0.5
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3)
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

      {/* Pour Notifications - Only for actual POUR events */}
      <div className="fixed top-24 right-4 z-50 flex flex-col gap-3 pointer-events-none">
        {notifications.map((notif, index) => (
          <div
            key={notif.id}
            className="glass-panel-elevated rounded-xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-right-full fade-in duration-500"
            style={{
              animationDelay: `${index * 50}ms`,
              opacity: 1 - index * 0.15,
            }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--aqua-bg)]">
              {/* Aquarius water drop icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--aqua-primary)]">
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                <span className="text-[var(--aqua-primary)]">POUR</span> {notif.tokenSymbol}
              </p>
              <p className="text-xs text-[var(--text-muted)]">+{notif.amount.toFixed(4)} SOL Liquidity</p>
            </div>
            <div className="text-xs font-bold px-2 py-1 rounded bg-[var(--aqua-bg)] text-[var(--aqua-primary)]">
              +LIQ
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
