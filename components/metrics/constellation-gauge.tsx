"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface ConstellationGaugeProps {
  strength: number
  isLoading?: boolean
}

export function ConstellationGauge({ strength, isLoading = false }: ConstellationGaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const clampedStrength = Math.max(0, Math.min(100, strength))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const size = canvas.offsetWidth
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const centerX = size / 2
    const centerY = size / 2
    const radius = size / 2 - 15

    let animationId: number
    let currentAngle = 0
    let time = 0
    const targetAngle = (clampedStrength / 100) * Math.PI * 1.5

    // Star positions for Aquarius constellation pattern
    const stars = [
      { angle: 0.8, dist: 0.3, size: 2 },
      { angle: 1.0, dist: 0.5, size: 2.5 },
      { angle: 1.3, dist: 0.4, size: 2 },
      { angle: 1.5, dist: 0.6, size: 3 },
      { angle: 1.8, dist: 0.45, size: 2 },
      { angle: 2.0, dist: 0.55, size: 2.5 },
      { angle: 2.3, dist: 0.35, size: 2 },
    ]

    const animate = () => {
      ctx.clearRect(0, 0, size, size)

      // Background glow
      const bgGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 10)
      bgGlow.addColorStop(0, "rgba(0, 242, 255, 0.05)")
      bgGlow.addColorStop(0.5, "rgba(0, 242, 255, 0.02)")
      bgGlow.addColorStop(1, "rgba(0, 242, 255, 0)")
      ctx.fillStyle = bgGlow
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2)
      ctx.fill()

      // Background arc track
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"
      ctx.lineWidth = 10
      ctx.lineCap = "round"
      ctx.stroke()

      // Animated progress arc
      currentAngle += (targetAngle - currentAngle) * 0.03

      // Gradient based on strength
      const gradient = ctx.createConicGradient(Math.PI * 0.75, centerX, centerY)
      gradient.addColorStop(0, "#00f2ff")
      gradient.addColorStop(0.33, "#0ea5e9")
      gradient.addColorStop(0.66, "#ec4899")
      gradient.addColorStop(1, "#ff6b35")

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 0.75 + currentAngle)
      ctx.strokeStyle = gradient
      ctx.lineWidth = 10
      ctx.lineCap = "round"
      ctx.shadowColor = "rgba(0, 242, 255, 0.5)"
      ctx.shadowBlur = 15
      ctx.stroke()
      ctx.shadowBlur = 0

      // Draw constellation stars
      stars.forEach((star, i) => {
        const starAngle = Math.PI * 0.75 + star.angle
        const starDist = radius * star.dist
        const x = centerX + Math.cos(starAngle) * starDist
        const y = centerY + Math.sin(starAngle) * starDist

        const starProgress = star.angle / (Math.PI * 1.5)
        const isActive = starProgress * 100 <= clampedStrength

        // Star glow
        if (isActive) {
          const pulseSize = star.size + Math.sin(time * 0.003 + i) * 1
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, pulseSize * 4)
          glowGradient.addColorStop(0, "rgba(0, 242, 255, 0.8)")
          glowGradient.addColorStop(0.3, "rgba(0, 242, 255, 0.3)")
          glowGradient.addColorStop(1, "rgba(0, 242, 255, 0)")

          ctx.beginPath()
          ctx.fillStyle = glowGradient
          ctx.arc(x, y, pulseSize * 4, 0, Math.PI * 2)
          ctx.fill()
        }

        // Star core
        ctx.beginPath()
        ctx.arc(x, y, star.size, 0, Math.PI * 2)
        ctx.fillStyle = isActive ? "#00f2ff" : "rgba(255, 255, 255, 0.15)"
        ctx.fill()
      })

      // Draw connecting lines between active stars
      ctx.beginPath()
      ctx.strokeStyle = "rgba(0, 242, 255, 0.2)"
      ctx.lineWidth = 1
      let firstActive = true
      stars.forEach((star) => {
        const starProgress = star.angle / (Math.PI * 1.5)
        if (starProgress * 100 <= clampedStrength) {
          const starAngle = Math.PI * 0.75 + star.angle
          const x = centerX + Math.cos(starAngle) * radius * star.dist
          const y = centerY + Math.sin(starAngle) * radius * star.dist
          if (firstActive) {
            ctx.moveTo(x, y)
            firstActive = false
          } else {
            ctx.lineTo(x, y)
          }
        }
      })
      ctx.stroke()

      time += 16

      if (Math.abs(currentAngle - targetAngle) > 0.001 || true) {
        animationId = requestAnimationFrame(animate)
      }
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [clampedStrength])

  const getHealthLabel = () => {
    if (clampedStrength >= 80) return "Excellent"
    if (clampedStrength >= 60) return "Strong"
    if (clampedStrength >= 40) return "Moderate"
    if (clampedStrength >= 20) return "Weak"
    return "Critical"
  }

  const getHealthColor = () => {
    if (clampedStrength >= 60) return "text-[var(--success)]"
    if (clampedStrength >= 40) return "text-[var(--warm-orange)]"
    return "text-[var(--error)]"
  }

  return (
    <div className="relative h-20">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-xl font-bold text-[var(--text-primary)] font-mono">{clampedStrength.toFixed(0)}</p>
        <p className={cn("text-[10px] font-semibold uppercase tracking-wider", getHealthColor())}>{getHealthLabel()}</p>
      </div>
    </div>
  )
}
