"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface TokenPourOverlayProps {
  tokenId: string
  tokenSymbol: string
  creatorWallet: string // Added creator wallet to detect POUR events
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
  type: "water" | "droplet"
}

interface PourEvent {
  id: string
  amount: number
  timestamp: number
}

export function TokenPourOverlay({ tokenId, tokenSymbol, creatorWallet }: TokenPourOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(0)
  const [recentPours, setRecentPours] = useState<PourEvent[]>([])
  const [isPouringActive, setIsPouringActive] = useState(false)

  const createPourBurst = useCallback((amountSol: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    setIsPouringActive(true)
    setTimeout(() => setIsPouringActive(false), 2000)

    const particles = particlesRef.current
    // Scale particle count based on pour amount (more SOL = more particles)
    const count = Math.min(150, Math.floor(amountSol * 50) + 40)
    const centerX = canvas.width / 2
    const startY = 80 // Start from the "vessel" position

    // Aquarius water colors - cyan/teal/blue gradient
    const colors = [
      "#00f2ff", // Bright aqua
      "#06b6d4", // Cyan
      "#0891b2", // Dark cyan
      "#22d3ee", // Light cyan
      "#67e8f9", // Pale cyan
      "#a5f3fc", // Very light cyan
      "#0ea5e9", // Sky blue
      "#38bdf8", // Light blue
    ]

    // Create the main water stream
    for (let i = 0; i < count; i++) {
      const delay = Math.random() * 30 // Staggered release
      const streamOffset = (Math.random() - 0.5) * 40 // Narrow stream
      const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.4 // Mostly downward
      const speed = Math.random() * 4 + 2
      const life = Math.random() * 150 + 80

      setTimeout(() => {
        particles.push({
          x: centerX + streamOffset,
          y: startY + Math.random() * 20,
          vx: Math.cos(angle) * speed * (Math.random() - 0.5),
          vy: Math.sin(angle) * speed,
          size: Math.random() * 6 + 3,
          opacity: Math.random() * 0.6 + 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: life,
          type: "water",
        })
      }, delay * 10)
    }

    // Create splash droplets at the bottom
    setTimeout(() => {
      const splashCount = Math.floor(count * 0.4)
      for (let i = 0; i < splashCount; i++) {
        const splashX = centerX + (Math.random() - 0.5) * 200
        const splashY = canvas.height - 100 + Math.random() * 50
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8
        const speed = Math.random() * 5 + 2

        particles.push({
          x: splashX,
          y: splashY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: Math.random() * 4 + 2,
          opacity: Math.random() * 0.5 + 0.3,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: Math.random() * 60 + 30,
          type: "droplet",
        })
      }
    }, 400)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`token-pour-${tokenId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trades",
          filter: `token_id=eq.${tokenId}`,
        },
        (payload) => {
          const trade = payload.new as {
            wallet_address: string
            amount_sol: number
            type: string
            id: string
          }

          // This is the "Pour Rate" mechanism - creator adding liquidity
          if (trade.wallet_address?.toLowerCase() === creatorWallet?.toLowerCase() && trade.type === "buy") {
            const amount = Number(trade.amount_sol) || 0.1
            createPourBurst(amount)

            // Track recent pours for display
            setRecentPours((prev) => [{ id: trade.id, amount, timestamp: Date.now() }, ...prev.slice(0, 4)])
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tokenId, creatorWallet, createPourBurst])

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width
        canvas.height = rect.height
      }
    }
    resize()
    window.addEventListener("resize", resize)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const particles = particlesRef.current

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]

        // Physics
        p.vy += 0.15 // Gravity
        p.vx *= 0.995 // Air resistance
        p.x += p.vx
        p.y += p.vy
        p.life -= 1
        p.opacity = Math.max(0, (p.life / 120) * 0.8)

        // Remove dead particles
        if (p.life <= 0 || p.y > canvas.height + 50) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.globalAlpha = p.opacity

        // Glow effect
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(0.3, p.color + "80")
        gradient.addColorStop(0.6, p.color + "40")
        gradient.addColorStop(1, "transparent")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fill()

        // Core droplet
        ctx.fillStyle = p.color
        ctx.beginPath()
        if (p.type === "water") {
          // Elongated drop shape for falling water
          ctx.ellipse(p.x, p.y, p.size * 0.7, p.size * 1.2, 0, 0, Math.PI * 2)
        } else {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        }
        ctx.fill()

        // Highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
        ctx.beginPath()
        ctx.arc(p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.3, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()
      }

      // Draw vessel silhouette when pouring
      if (isPouringActive) {
        const centerX = canvas.width / 2
        ctx.save()
        ctx.globalAlpha = 0.3

        // Simple vessel shape
        ctx.strokeStyle = "#00f2ff"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(centerX - 30, 20)
        ctx.lineTo(centerX - 40, 60)
        ctx.lineTo(centerX - 20, 80)
        ctx.lineTo(centerX + 10, 80)
        ctx.lineTo(centerX + 20, 60)
        ctx.lineTo(centerX + 10, 20)
        ctx.closePath()
        ctx.stroke()

        // Pouring spout
        ctx.beginPath()
        ctx.moveTo(centerX - 20, 80)
        ctx.quadraticCurveTo(centerX - 10, 100, centerX, 90)
        ctx.stroke()

        ctx.restore()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationRef.current)
    }
  }, [isPouringActive])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-20"
        style={{ mixBlendMode: "screen" }}
      />

      {/* Pour event indicator */}
      {recentPours.length > 0 && (
        <div className="absolute top-4 right-4 z-30 space-y-2">
          {recentPours.map((pour, index) => (
            <div
              key={pour.id}
              className="glass-panel px-3 py-2 text-sm animate-fade-in"
              style={{
                opacity: 1 - index * 0.2,
                animationDelay: `${index * 100}ms`,
              }}
            >
              <span className="text-aqua-400 font-medium">POUR</span>
              <span className="text-white/60 ml-2">+{pour.amount.toFixed(4)} SOL</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
