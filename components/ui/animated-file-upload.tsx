"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface AnimatedFileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number
  preview?: string | null
  className?: string
}

export function AnimatedFileUpload({
  onFileSelect,
  accept = "image/*",
  maxSize = 5 * 1024 * 1024,
  preview,
  className,
}: AnimatedFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const processFile = useCallback(
    (file: File) => {
      setError(null)

      if (file.size > maxSize) {
        setError(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`)
        return
      }

      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file")
        return
      }

      setIsUploading(true)
      // Simulate upload animation
      setTimeout(() => {
        onFileSelect(file)
        setIsUploading(false)
      }, 800)
    },
    [maxSize, onFileSelect],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0])
      }
    },
    [processFile],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input ref={inputRef} type="file" accept={accept} onChange={handleFileChange} className="sr-only" />

      <motion.div
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        animate={{
          borderColor: isDragging ? "var(--aqua-primary)" : "var(--glass-border)",
          backgroundColor: isDragging ? "rgba(0, 242, 255, 0.05)" : "transparent",
        }}
        className={cn(
          "relative w-full aspect-square rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all",
          "hover:border-[var(--aqua-border)] hover:bg-[var(--aqua-subtle)]",
        )}
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0"
            >
              <img src={preview || "/placeholder.svg"} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--ocean-deep)] via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                <span className="text-sm font-medium text-[var(--text-primary)]">Click to change</span>
              </div>
            </motion.div>
          ) : isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <motion.div
                className="w-16 h-16 rounded-full border-3 border-[var(--aqua-primary)] border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              />
              <p className="mt-4 text-sm text-[var(--text-secondary)]">Processing...</p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-6"
            >
              <motion.div
                animate={isDragging ? { scale: 1.1, y: -10 } : { scale: 1, y: 0 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--warm-coral)]/10 flex items-center justify-center mb-4"
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-[var(--aqua-primary)]">
                  <path
                    d="M24 17v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6M19 9l-5-5-5 5M14 4v14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>
              <p className="text-sm font-medium text-[var(--text-primary)] text-center mb-1">
                {isDragging ? "Drop your image here" : "Drag & drop or click to upload"}
              </p>
              <p className="text-xs text-[var(--text-muted)] text-center">PNG, JPG, GIF up to 5MB</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 text-sm text-[var(--error)]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
