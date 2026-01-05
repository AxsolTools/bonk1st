"use client"

import { useEffect, useRef } from "react"

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  pulseSpeed: number
  pulseOffset: number
}

interface Connection {
  from: number
  to: number
}

export function AquariusConstellation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    // Aquarius constellation star positions (normalized 0-1)
    const starPositions = [
      { x: 0.15, y: 0.2 },
      { x: 0.25, y: 0.15 },
      { x: 0.35, y: 0.25 },
      { x: 0.45, y: 0.2 },
      { x: 0.55, y: 0.3 },
      { x: 0.65, y: 0.35 },
      { x: 0.75, y: 0.4 },
      { x: 0.85, y: 0.45 },
      { x: 0.5, y: 0.5 },
      { x: 0.4, y: 0.6 },
      { x: 0.3, y: 0.7 },
      { x: 0.45, y: 0.75 },
      { x: 0.6, y: 0.65 },
      { x: 0.7, y: 0.7 },
      { x: 0.8, y: 0.6 },
    ]

    const connections: Connection[] = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 4, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 9, to: 11 },
      { from: 8, to: 12 },
      { from: 12, to: 13 },
      { from: 12, to: 14 },
    ]

    let stars: Star[] = []

    const createStars = () => {
      const width = canvas.offsetWidth
      const height = canvas.offsetHeight

      stars = starPositions.map((pos) => ({
        x: pos.x * width,
        y: pos.y * height,
        size: 1.5 + Math.random() * 1.5,
        opacity: 0.3 + Math.random() * 0.4,
        pulseSpeed: 0.5 + Math.random() * 1,
        pulseOffset: Math.random() * Math.PI * 2,
      }))
    }

    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      // Draw connections
      ctx.strokeStyle = "rgba(0, 242, 255, 0.1)"
      ctx.lineWidth = 1

      connections.forEach(({ from, to }) => {
        const starFrom = stars[from]
        const starTo = stars[to]
        if (!starFrom || !starTo) return

        ctx.beginPath()
        ctx.moveTo(starFrom.x, starFrom.y)
        ctx.lineTo(starTo.x, starTo.y)
        ctx.stroke()
      })

      // Draw stars
      stars.forEach((star) => {
        const pulse = Math.sin(time * 0.001 * star.pulseSpeed + star.pulseOffset) * 0.3 + 0.7
        const currentOpacity = star.opacity * pulse

        ctx.beginPath()
        ctx.fillStyle = `rgba(0, 242, 255, ${currentOpacity})`
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fill()

        // Glow effect
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 4)
        gradient.addColorStop(0, `rgba(0, 242, 255, ${currentOpacity * 0.5})`)
        gradient.addColorStop(1, "rgba(0, 242, 255, 0)")

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(star.x, star.y, star.size * 4, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }

    resize()
    createStars()
    animate(0)

    window.addEventListener("resize", () => {
      resize()
      createStars()
    })

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%" }} />
}
