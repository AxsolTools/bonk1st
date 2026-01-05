"use client"

import { useState } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface CreateWalletModalProps {
  open: boolean
  onClose: () => void
}

export function CreateWalletModal({ open, onClose }: CreateWalletModalProps) {
  const { user, wallets, refreshWallets } = useAuth()
  const [step, setStep] = useState<"generate" | "backup" | "confirm">("generate")
  const [label, setLabel] = useState("")
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([])
  const [publicKey, setPublicKey] = useState("")
  const [encryptedKey, setEncryptedKey] = useState("")
  const [confirmWords, setConfirmWords] = useState<{ index: number; word: string }[]>([])
  const [userInputs, setUserInputs] = useState<Record<number, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const generateWallet = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Call API to generate wallet keypair
      const response = await fetch("/api/wallet/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) throw new Error("Failed to generate wallet")

      const data = await response.json()
      setRecoveryPhrase(data.mnemonic.split(" "))
      setPublicKey(data.publicKey)
      setEncryptedKey(data.encryptedPrivateKey)

      // Select 3 random words for confirmation
      const indices = [2, 5, 9].map((i) => ({
        index: i,
        word: data.mnemonic.split(" ")[i],
      }))
      setConfirmWords(indices)

      setStep("backup")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = async () => {
    // Verify user entered correct words
    for (const { index, word } of confirmWords) {
      if (userInputs[index]?.toLowerCase() !== word.toLowerCase()) {
        setError("Recovery phrase verification failed. Please try again.")
        return
      }
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const isPrimary = wallets.length === 0

      const { error: insertError } = await supabase.from("wallets").insert({
        user_id: user?.id,
        public_key: publicKey,
        encrypted_private_key: encryptedKey,
        label: label || "My Wallet",
        is_primary: isPrimary,
      })

      if (insertError) throw insertError

      await refreshWallets()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setStep("generate")
    setLabel("")
    setRecoveryPhrase([])
    setPublicKey("")
    setEncryptedKey("")
    setConfirmWords([])
    setUserInputs({})
    setError(null)
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

        {step === "generate" && (
          <>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Create New Wallet</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Generate a new Solana wallet. Your private key will be encrypted and stored securely.
            </p>

            <div className="mb-6">
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Wallet Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)] transition-colors"
                placeholder="e.g., Trading Wallet"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={generateWallet}
              disabled={isLoading}
              className={cn(
                "w-full py-3 rounded-lg font-medium text-sm transition-all",
                "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]",
                "hover:shadow-[0_0_20px_rgba(0,242,255,0.4)]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isLoading ? "Generating..." : "Generate Wallet"}
            </button>
          </>
        )}

        {step === "backup" && (
          <>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Backup Recovery Phrase</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Write down these 12 words in order. This is the only way to recover your wallet.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-6 p-4 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)]">
              {recoveryPhrase.map((word, index) => (
                <div key={index} className="flex items-center gap-2 p-2">
                  <span className="text-xs text-[var(--text-muted)] w-4">{index + 1}.</span>
                  <span className="text-sm font-mono text-[var(--text-primary)]">{word}</span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-[var(--warm-orange)]/10 border border-[var(--warm-orange)]/30 mb-6">
              <p className="text-sm text-[var(--warm-orange)]">
                Never share your recovery phrase. Anyone with access can steal your funds.
              </p>
            </div>

            <button
              onClick={() => setStep("confirm")}
              className="w-full py-3 rounded-lg bg-[var(--aqua-primary)] text-[var(--ocean-deep)] font-medium text-sm hover:shadow-[0_0_20px_rgba(0,242,255,0.4)] transition-all"
            >
              I've Written It Down
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Verify Recovery Phrase</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Enter the requested words from your recovery phrase to confirm you've backed it up.
            </p>

            <div className="space-y-4 mb-6">
              {confirmWords.map(({ index }) => (
                <div key={index}>
                  <label className="block text-sm text-[var(--text-secondary)] mb-2">Word #{index + 1}</label>
                  <input
                    type="text"
                    value={userInputs[index] || ""}
                    onChange={(e) => setUserInputs({ ...userInputs, [index]: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)] transition-colors font-mono"
                    placeholder="Enter word"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className={cn(
                "w-full py-3 rounded-lg font-medium text-sm transition-all",
                "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]",
                "hover:shadow-[0_0_20px_rgba(0,242,255,0.4)]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isLoading ? "Saving..." : "Confirm & Save Wallet"}
            </button>
          </>
        )}
      </GlassPanel>
    </div>
  )
}
