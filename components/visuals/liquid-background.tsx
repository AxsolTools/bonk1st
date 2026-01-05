"use client"

import { useEffect, useRef } from "react"

export function LiquidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const blobs = [
      { x: 0.2, y: 0.3, radius: 300, color: "rgba(20, 184, 166, 0.06)", speed: 0.0003 },
      { x: 0.8, y: 0.2, radius: 400, color: "rgba(13, 148, 136, 0.05)", speed: 0.0002 },
      { x: 0.5, y: 0.7, radius: 350, color: "rgba(34, 197, 94, 0.04)", speed: 0.00025 },
      { x: 0.9, y: 0.8, radius: 280, color: "rgba(15, 118, 110, 0.04)", speed: 0.00035 },
    ]

    const animate = () => {
      time += 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      blobs.forEach((blob, i) => {
        const offsetX = Math.sin(time * blob.speed + i * 2) * 100
        const offsetY = Math.cos(time * blob.speed * 0.8 + i * 1.5) * 80
        const scale = 1 + Math.sin(time * blob.speed * 0.5) * 0.1

        const x = blob.x * canvas.width + offsetX
        const y = blob.y * canvas.height + offsetY
        const r = blob.radius * scale

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
        gradient.addColorStop(0, blob.color)
        gradient.addColorStop(1, "transparent")

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ filter: "blur(60px)", background: "transparent" }}
    />
  )
}
