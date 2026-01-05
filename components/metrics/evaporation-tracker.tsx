"use client"

import { useEffect, useRef } from "react"

interface EvaporationTrackerProps {
  totalEvaporated: number
  evaporationRate: number
  symbol: string
  isLoading?: boolean
}

export function EvaporationTracker({ totalEvaporated, evaporationRate, symbol, isLoading = false }: EvaporationTrackerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    const width = canvas.offsetWidth
    const height = canvas.offsetHeight

    interface Particle {
      x: number
      y: number
      size: number
      speed: number
      opacity: number
      drift: number
      hue: number
    }

    const particles: Particle[] = []
    let animationId: number
    let time = 0

    const createParticle = () => {
      const hues = [25, 330, 300, 35] // orange, pink, magenta, coral
      particles.push({
        x: width * 0.3 + Math.random() * width * 0.4,
        y: height - 10,
        size: 1.5 + Math.random() * 3,
        speed: 0.3 + Math.random() * 0.8,
        opacity: 0.5 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.5,
        hue: hues[Math.floor(Math.random() * hues.length)],
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw heat source at bottom
      const heatGradient = ctx.createLinearGradient(width * 0.3, height, width * 0.7, height - 30)
      heatGradient.addColorStop(0, "rgba(255, 107, 53, 0.3)")
      heatGradient.addColorStop(0.5, "rgba(255, 107, 53, 0.15)")
      heatGradient.addColorStop(1, "rgba(255, 107, 53, 0)")

      ctx.fillStyle = heatGradient
      ctx.beginPath()
      ctx.ellipse(width / 2, height + 10, width * 0.25, 25, 0, 0, Math.PI * 2)
      ctx.fill()

      // Create new particles based on evaporation rate
      const spawnRate = Math.max(0.02, evaporationRate / 30)
      if (Math.random() < spawnRate) {
        createParticle()
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.y -= p.speed
        p.x += p.drift + Math.sin(time * 0.01 + i) * 0.3
        p.opacity -= 0.003
        p.size *= 0.998

        if (p.opacity <= 0 || p.y < 0 || p.size < 0.5) {
          particles.splice(i, 1)
          continue
        }

        // Multi-layer glow effect
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${p.opacity})`)
        gradient.addColorStop(0.3, `hsla(${p.hue}, 100%, 50%, ${p.opacity * 0.5})`)
        gradient.addColorStop(0.6, `hsla(${p.hue}, 100%, 40%, ${p.opacity * 0.2})`)
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 30%, 0)`)

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        ctx.fill()

        // Inner bright core
        ctx.beginPath()
        ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.opacity})`
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      time += 16
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [evaporationRate])

  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toFixed(0)
  }

  return (
    <div className="relative h-20 rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        <p className="text-lg font-bold text-[var(--warm-orange)] font-mono drop-shadow-[0_0_10px_rgba(255,107,53,0.5)]">
          {formatNumber(totalEvaporated)}
        </p>
        <p className="text-[10px] text-[var(--text-secondary)]">{symbol} burned</p>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--warm-orange)]/10 border border-[var(--warm-orange)]/20 mt-1">
          <div className="w-1 h-1 rounded-full bg-[var(--warm-orange)] animate-pulse" />
          <span className="text-[10px] font-mono text-[var(--warm-orange)]">{evaporationRate}%/hr</span>
        </div>
      </div>
    </div>
  )
}
