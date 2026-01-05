"use client"

import { useState } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface ImportWalletModalProps {
  open: boolean
  onClose: () => void
}

export function ImportWalletModal({ open, onClose }: ImportWalletModalProps) {
  const { user, wallets, refreshWallets } = useAuth()
  const [importType, setImportType] = useState<"phrase" | "privateKey">("phrase")
  const [label, setLabel] = useState("")
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleImport = async () => {
    if (wallets.length >= 25) {
      setError("Maximum 25 wallets reached. Remove a wallet to add a new one.")
      return
    }
    
    if (!input.trim()) {
      setError("Please enter your recovery phrase or private key")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: importType,
          value: input.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to import wallet")
      }

      const data = await response.json()
      const supabase = createClient()
      const isPrimary = wallets.length === 0

      const { error: insertError } = await supabase.from("wallets").insert({
        user_id: user?.id,
        public_key: data.publicKey,
        encrypted_private_key: data.encryptedPrivateKey,
        label: label || "Imported Wallet",
        is_primary: isPrimary,
      })

      if (insertError) throw insertError

      await refreshWallets()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setLabel("")
    setInput("")
    setError(null)
    setImportType("phrase")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--ocean-deep)]/80 backdrop-blur-sm" onClick={handleClose} />

      <GlassPanel className="relative w-full max-w-lg p-8" glow>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--ocean-surface)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 5l10 10M5 15L15 5" strokeLinecap="round" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Import Wallet</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Import an existing Solana wallet using your recovery phrase or private key.
        </p>

        {/* Import Type Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setImportType("phrase")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              importType === "phrase"
                ? "bg-[var(--aqua-subtle)] text-[var(--aqua-primary)] border border-[var(--aqua-primary)]"
                : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] border border-[var(--glass-border)]",
            )}
          >
            Recovery Phrase
          </button>
          <button
            onClick={() => setImportType("privateKey")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              importType === "privateKey"
                ? "bg-[var(--aqua-subtle)] text-[var(--aqua-primary)] border border-[var(--aqua-primary)]"
                : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] border border-[var(--glass-border)]",
            )}
          >
            Private Key
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Wallet Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)] transition-colors"
            placeholder="e.g., Main Wallet"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            {importType === "phrase" ? "Recovery Phrase (12 or 24 words)" : "Private Key"}
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={importType === "phrase" ? 4 : 2}
            className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)] transition-colors font-mono text-sm resize-none"
            placeholder={
              importType === "phrase"
                ? "Enter your 12 or 24 word recovery phrase separated by spaces"
                : "Enter your base58 encoded private key"
            }
          />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        <button
          onClick={handleImport}
          disabled={isLoading}
          className={cn(
            "w-full py-3 rounded-lg font-medium text-sm transition-all",
            "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]",
            "hover:shadow-[0_0_20px_rgba(0,242,255,0.4)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isLoading ? "Importing..." : "Import Wallet"}
        </button>
      </GlassPanel>
    </div>
  )
}
