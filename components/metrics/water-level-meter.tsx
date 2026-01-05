"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface WaterLevelMeterProps {
  level: number
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  isLoading?: boolean
}

export function WaterLevelMeter({ level, size = "md", showLabel = true, isLoading = false }: WaterLevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const clampedLevel = Math.max(0, Math.min(100, level))

  const heights = {
    sm: 40,
    md: 60,
    lg: 100,
  }

  const height = heights[size]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.offsetWidth
    const canvasHeight = canvas.offsetHeight

    canvas.width = width * dpr
    canvas.height = canvasHeight * dpr
    ctx.scale(dpr, dpr)

    let animationId: number
    let phase = 0
    let currentLevel = 0

    const animate = () => {
      ctx.clearRect(0, 0, width, canvasHeight)

      // Smoothly animate to target level
      currentLevel += (clampedLevel - currentLevel) * 0.05

      // Background with gradient
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
      bgGradient.addColorStop(0, "rgba(10, 11, 13, 0.95)")
      bgGradient.addColorStop(1, "rgba(15, 16, 20, 0.9)")
      ctx.fillStyle = bgGradient
      ctx.beginPath()
      ctx.roundRect(0, 0, width, canvasHeight, 8)
      ctx.fill()

      // Water level calculation
      const waterHeight = (currentLevel / 100) * canvasHeight
      const waterY = canvasHeight - waterHeight

      if (waterHeight > 0) {
        // Create clipping region for water
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(0, 0, width, canvasHeight, 8)
        ctx.clip()

        // Wave effect with multiple layers
        ctx.beginPath()
        ctx.moveTo(0, canvasHeight)

        // Primary wave - Updated to teal color
        for (let x = 0; x <= width; x++) {
          const waveHeight1 = Math.sin((x / width) * Math.PI * 2 + phase) * 3
          const waveHeight2 = Math.sin((x / width) * Math.PI * 4 + phase * 1.5) * 1.5
          const y = waterY + waveHeight1 + waveHeight2
          ctx.lineTo(x, y)
        }

        ctx.lineTo(width, canvasHeight)
        ctx.closePath()

        const waterGradient = ctx.createLinearGradient(0, waterY, 0, canvasHeight)
        waterGradient.addColorStop(0, "rgba(20, 184, 166, 0.7)")
        waterGradient.addColorStop(0.3, "rgba(13, 148, 136, 0.5)")
        waterGradient.addColorStop(0.7, "rgba(15, 118, 110, 0.35)")
        waterGradient.addColorStop(1, "rgba(17, 94, 89, 0.25)")

        ctx.fillStyle = waterGradient
        ctx.fill()

        ctx.beginPath()
        for (let x = 0; x <= width; x++) {
          const waveHeight1 = Math.sin((x / width) * Math.PI * 2 + phase) * 3
          const waveHeight2 = Math.sin((x / width) * Math.PI * 4 + phase * 1.5) * 1.5
          const y = waterY + waveHeight1 + waveHeight2
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = "rgba(20, 184, 166, 0.9)"
        ctx.lineWidth = 2
        ctx.shadowColor = "rgba(20, 184, 166, 0.8)"
        ctx.shadowBlur = 10
        ctx.stroke()
        ctx.shadowBlur = 0

        ctx.restore()
      }

      ctx.strokeStyle = "rgba(20, 184, 166, 0.2)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(0, 0, width, canvasHeight, 8)
      ctx.stroke()

      phase += 0.04
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [clampedLevel])

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full rounded-lg" style={{ height }} />
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "font-mono font-bold text-[var(--text-primary)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]",
              size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-lg",
            )}
          >
            {clampedLevel.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  )
}
