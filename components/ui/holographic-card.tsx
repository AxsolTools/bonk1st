"use client"

import type React from "react"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface HolographicCardProps {
  children: React.ReactNode
  className?: string
  glowColor?: string
}

export function HolographicCard({ children, className, glowColor = "var(--aqua-primary)" }: HolographicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return

    const rect = cardRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const mouseX = e.clientX - centerX
    const mouseY = e.clientY - centerY

    const maxRotation = 8
    const rotateYValue = (mouseX / (rect.width / 2)) * maxRotation
    const rotateXValue = -(mouseY / (rect.height / 2)) * maxRotation

    setRotateX(rotateXValue)
    setRotateY(rotateYValue)

    const glowX = ((e.clientX - rect.left) / rect.width) * 100
    const glowY = ((e.clientY - rect.top) / rect.height) * 100
    setGlowPosition({ x: glowX, y: glowY })
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
    setGlowPosition({ x: 50, y: 50 })
  }

  return (
    <motion.div
      ref={cardRef}
      className={cn("relative", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: "preserve-3d",
        perspective: "1000px",
      }}
      animate={{
        rotateX,
        rotateY,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Glow effect layer */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, ${glowColor}20 0%, transparent 50%)`,
        }}
      />

      {/* Holographic shimmer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(
              ${105 + rotateY * 2}deg,
              transparent 0%,
              rgba(0, 242, 255, 0.03) 25%,
              transparent 50%,
              rgba(249, 115, 22, 0.03) 75%,
              transparent 100%
            )`,
          }}
        />
      </div>

      {/* Card content */}
      <div className="relative glass-panel rounded-2xl overflow-hidden">{children}</div>
    </motion.div>
  )
}
