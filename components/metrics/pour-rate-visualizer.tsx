"use client"

import { useEffect, useRef } from "react"

interface PourRateVisualizerProps {
  rate: number
  isLoading?: boolean
}

export function PourRateVisualizer({ rate, isLoading = false }: PourRateVisualizerProps) {
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

    interface Drop {
      x: number
      y: number
      speed: number
      size: number
      opacity: number
    }

    const drops: Drop[] = []
    let animationId: number
    let time = 0

    // Vessel/Urn position
    const vesselX = width / 2
    const vesselY = 25
    const pourWidth = 24

    const createDrop = () => {
      const spread = (Math.random() - 0.5) * pourWidth
      drops.push({
        x: vesselX + spread,
        y: vesselY + 20,
        speed: 1.5 + Math.random() * 2,
        size: 2 + Math.random() * 3,
        opacity: 0.6 + Math.random() * 0.4,
      })
    }

    const drawVessel = () => {
      // Aquarius urn silhouette
      ctx.save()
      ctx.translate(vesselX, vesselY)

      // Urn body
      ctx.beginPath()
      ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2)
      const urnGradient = ctx.createRadialGradient(-5, -3, 0, 0, 0, 18)
      urnGradient.addColorStop(0, "rgba(20, 184, 166, 0.4)")
      urnGradient.addColorStop(0.5, "rgba(20, 184, 166, 0.2)")
      urnGradient.addColorStop(1, "rgba(20, 184, 166, 0.1)")
      ctx.fillStyle = urnGradient
      ctx.fill()

      // Urn rim glow
      ctx.strokeStyle = "rgba(20, 184, 166, 0.6)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Spout with pour animation
      const pourAngle = Math.sin(time * 0.003) * 0.1
      ctx.rotate(pourAngle)

      ctx.beginPath()
      ctx.moveTo(12, 6)
      ctx.quadraticCurveTo(16, 10, 14, 18)
      ctx.lineTo(8, 18)
      ctx.quadraticCurveTo(10, 10, 12, 6)
      ctx.fillStyle = "rgba(20, 184, 166, 0.3)"
      ctx.fill()
      ctx.strokeStyle = "rgba(20, 184, 166, 0.5)"
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.restore()
    }

    const drawPool = () => {
      const poolHeight = 25
      const poolY = height - poolHeight

      const poolGradient = ctx.createLinearGradient(0, poolY, 0, height)
      poolGradient.addColorStop(0, "rgba(20, 184, 166, 0.3)")
      poolGradient.addColorStop(0.5, "rgba(13, 148, 136, 0.2)")
      poolGradient.addColorStop(1, "rgba(15, 118, 110, 0.1)")

      // Animated wave surface
      ctx.beginPath()
      ctx.moveTo(0, poolY)
      for (let x = 0; x <= width; x++) {
        const wave1 = Math.sin((x / width) * Math.PI * 3 + time * 0.004) * 2
        const wave2 = Math.sin((x / width) * Math.PI * 5 + time * 0.006) * 1
        ctx.lineTo(x, poolY + wave1 + wave2)
      }
      ctx.lineTo(width, height)
      ctx.lineTo(0, height)
      ctx.closePath()
      ctx.fillStyle = poolGradient
      ctx.fill()

      // Surface glow line
      ctx.beginPath()
      for (let x = 0; x <= width; x++) {
        const wave1 = Math.sin((x / width) * Math.PI * 3 + time * 0.004) * 2
        const wave2 = Math.sin((x / width) * Math.PI * 5 + time * 0.006) * 1
        const y = poolY + wave1 + wave2
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = "rgba(20, 184, 166, 0.7)"
      ctx.lineWidth = 1.5
      ctx.shadowColor = "rgba(20, 184, 166, 0.6)"
      ctx.shadowBlur = 8
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      drawVessel()
      drawPool()

      // Create drops based on pour rate
      const dropFrequency = Math.max(0.02, rate / 15)
      if (Math.random() < dropFrequency) {
        createDrop()
      }

      // Update and draw drops
      const poolY = height - 25

      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i]
        drop.y += drop.speed
        drop.speed += 0.15 // gravity

        // Remove when hitting pool
        if (drop.y > poolY - drop.size) {
          drops.splice(i, 1)
          continue
        }

        const gradient = ctx.createRadialGradient(drop.x, drop.y, 0, drop.x, drop.y, drop.size)
        gradient.addColorStop(0, `rgba(20, 184, 166, ${drop.opacity})`)
        gradient.addColorStop(0.6, `rgba(13, 148, 136, ${drop.opacity * 0.5})`)
        gradient.addColorStop(1, `rgba(15, 118, 110, 0)`)

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2)
        ctx.fill()

        // Drop trail
        ctx.beginPath()
        ctx.moveTo(drop.x, drop.y - drop.size)
        ctx.lineTo(drop.x, drop.y - drop.size - drop.speed * 2)
        ctx.strokeStyle = `rgba(20, 184, 166, ${drop.opacity * 0.3})`
        ctx.lineWidth = drop.size * 0.8
        ctx.lineCap = "round"
        ctx.stroke()
      }

      time += 16
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [rate])

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full h-20 rounded-lg" />
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <p className="text-lg font-bold text-[var(--aqua-primary)] font-mono aqua-text-glow">{rate.toFixed(1)}%</p>
        <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">per hour</p>
      </div>
    </div>
  )
}
