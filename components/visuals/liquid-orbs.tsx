"use client"

import { useEffect, useRef } from "react"

export function LiquidOrbs() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
    }

    // Define orbs with positions from inspiration image
    const orbs = [
      { x: 0.75, y: 0.2, size: 350, hue: 25, saturation: 100, speed: 0.0003 }, // Orange top-right
      { x: 0.8, y: 0.4, size: 280, hue: 330, saturation: 90, speed: 0.0004 }, // Pink mid-right
      { x: 0.65, y: 0.55, size: 200, hue: 300, saturation: 85, speed: 0.0005 }, // Magenta
      { x: 0.85, y: 0.65, size: 240, hue: 185, saturation: 100, speed: 0.0003 }, // Cyan
      { x: 0.15, y: 0.25, size: 180, hue: 220, saturation: 30, speed: 0.0002 }, // Dark glass sphere left
      { x: 0.12, y: 0.55, size: 150, hue: 220, saturation: 30, speed: 0.0002 }, // Dark glass sphere left bottom
    ]

    const drawOrb = (orb: (typeof orbs)[0], width: number, height: number) => {
      const baseX = orb.x * width
      const baseY = orb.y * height

      // Add subtle movement
      const offsetX = Math.sin(time * orb.speed * 1000) * 30
      const offsetY = Math.cos(time * orb.speed * 800) * 20

      const x = baseX + offsetX
      const y = baseY + offsetY

      // Create multi-stop gradient for more realistic liquid effect
      const gradient = ctx.createRadialGradient(x - orb.size * 0.2, y - orb.size * 0.2, 0, x, y, orb.size)

      if (orb.saturation > 50) {
        // Vibrant colored orbs
        gradient.addColorStop(0, `hsla(${orb.hue}, ${orb.saturation}%, 70%, 0.8)`)
        gradient.addColorStop(0.3, `hsla(${orb.hue}, ${orb.saturation}%, 55%, 0.5)`)
        gradient.addColorStop(0.6, `hsla(${orb.hue}, ${orb.saturation - 10}%, 40%, 0.25)`)
        gradient.addColorStop(0.85, `hsla(${orb.hue}, ${orb.saturation - 20}%, 25%, 0.1)`)
        gradient.addColorStop(1, `hsla(${orb.hue}, ${orb.saturation - 30}%, 15%, 0)`)
      } else {
        // Dark glass spheres
        gradient.addColorStop(0, `hsla(${orb.hue}, ${orb.saturation}%, 20%, 0.4)`)
        gradient.addColorStop(0.5, `hsla(${orb.hue}, ${orb.saturation}%, 12%, 0.3)`)
        gradient.addColorStop(0.8, `hsla(${orb.hue}, ${orb.saturation}%, 8%, 0.15)`)
        gradient.addColorStop(1, `hsla(${orb.hue}, ${orb.saturation}%, 5%, 0)`)

        // Add highlight for glass effect
        const highlightGradient = ctx.createRadialGradient(
          x - orb.size * 0.3,
          y - orb.size * 0.3,
          0,
          x - orb.size * 0.3,
          y - orb.size * 0.3,
          orb.size * 0.4,
        )
        highlightGradient.addColorStop(0, `rgba(255, 255, 255, 0.15)`)
        highlightGradient.addColorStop(1, `rgba(255, 255, 255, 0)`)

        ctx.beginPath()
        ctx.fillStyle = highlightGradient
        ctx.arc(x, y, orb.size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.beginPath()
      ctx.fillStyle = gradient
      ctx.arc(x, y, orb.size, 0, Math.PI * 2)
      ctx.fill()
    }

    const animate = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      ctx.clearRect(0, 0, width, height)

      // Draw orbs
      orbs.forEach((orb) => drawOrb(orb, width, height))

      time += 16
      animationId = requestAnimationFrame(animate)
    }

    resize()
    animate()

    window.addEventListener("resize", resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ filter: "blur(80px)", opacity: 0.9 }}
    />
  )
}
