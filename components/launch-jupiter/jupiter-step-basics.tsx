"use client"

import type React from "react"
import type { JupiterFormData } from "./jupiter-wizard"
import { GlassInput, GlassTextarea, GlassButton, ImageUpload } from "@/components/ui/glass-panel"
import { useState, useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"

interface JupiterStepBasicsProps {
  formData: JupiterFormData
  updateFormData: (updates: Partial<JupiterFormData>) => void
  onNext: () => void
  creatorWallet: string
}

// Custom Jupiter icon
const JupiterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" />
    <ellipse cx="12" cy="12" rx="11" ry="3" />
    <path d="M5 12h14" strokeWidth="1.5" />
  </svg>
)

export function JupiterStepBasics({ formData, updateFormData, onNext, creatorWallet }: JupiterStepBasicsProps) {
  const { activeWallet, mainWallet } = useAuth()
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)

  // Fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      const walletAddress = creatorWallet || activeWallet?.public_key || mainWallet?.public_key
      if (!walletAddress) {
        setIsLoadingBalance(false)
        return
      }

      try {
        setIsLoadingBalance(true)
        const response = await fetch(`/api/wallet/balance?address=${walletAddress}`)
        if (response.ok) {
          const data = await response.json()
          // API returns { success: true, data: { balanceSol: number } }
          if (data.success && data.data) {
            setWalletBalance(data.data.balanceSol || 0)
          } else if (data.balance !== undefined) {
            // Fallback for legacy format
            setWalletBalance(data.balance || 0)
          } else {
            setWalletBalance(0)
          }
        } else {
          console.error("Balance API returned error:", response.status)
          setWalletBalance(0)
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error)
        setWalletBalance(0)
      } finally {
        setIsLoadingBalance(false)
      }
    }

    fetchBalance()
    // Refresh balance every 15 seconds
    const interval = setInterval(fetchBalance, 15000)
    return () => clearInterval(interval)
  }, [creatorWallet, activeWallet, mainWallet])

  const handleImageChange = (file: File | null, preview: string | null) => {
    updateFormData({
      imageFile: file,
      imagePreview: preview,
    })
  }

  const initialBuy = parseFloat(formData.initialBuySol) || 0
  const estimatedCost = 0.02 + 0.1 + initialBuy + (initialBuy * 0.02) // rent + creation fee + buy + 2% fee
  const hasEnoughBalance = walletBalance !== null && walletBalance >= estimatedCost

  const isValid = 
    formData.name.length >= 2 && 
    formData.symbol.length >= 2 && 
    formData.symbol.length <= 10 &&
    initialBuy >= 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">Give your token an identity and set your initial buy amount.</p>
      </div>

      {/* Image and Name/Symbol Row */}
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-3">Token Image</label>
          <ImageUpload 
            value={formData.imagePreview}
            onChange={handleImageChange}
            accept="image/png,image/jpeg,image/gif"
            maxSize={2}
          />
        </div>

        {/* Name & Symbol */}
        <div className="flex-1 space-y-4">
          <GlassInput
            label="Token Name"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="e.g. Jupiter Token"
            hint="Minimum 2 characters"
          />
          <GlassInput
            label="Token Symbol"
            value={formData.symbol}
            onChange={(e) => updateFormData({ symbol: e.target.value.toUpperCase() })}
            placeholder="e.g. JUP"
            hint="2-10 characters, will be uppercase"
            maxLength={10}
          />
        </div>
      </div>

      {/* Description */}
      <GlassTextarea
        label="Description"
        value={formData.description}
        onChange={(e) => updateFormData({ description: e.target.value })}
        placeholder="What's your token about? Make it count..."
        rows={4}
        maxLength={500}
        charCount={formData.description.length}
        maxChars={500}
      />

      {/* Developer Initial Buy - CRITICAL FOR JUPITER */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
            <JupiterIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Developer Initial Buy</h3>
            <p className="text-xs text-[var(--text-muted)]">Your first purchase on the bonding curve</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Initial Buy Amount (SOL)
            </label>
            <div className="relative">
              <input
                type="number"
                value={formData.initialBuySol}
                onChange={(e) => updateFormData({ initialBuySol: e.target.value })}
                placeholder="0.0"
                min="0"
                step="0.1"
                className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-orange-500/30 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-sm text-orange-400 font-medium">SOL</span>
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              This is your initial purchase as the creator. You'll receive tokens at the starting price on the bonding curve.
            </p>
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex flex-wrap gap-2">
            {[0.1, 0.5, 1, 2, 5].map((amount) => (
              <button
                key={amount}
                onClick={() => updateFormData({ initialBuySol: amount.toString() })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.initialBuySol === amount.toString()
                    ? "bg-orange-500 text-white"
                    : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-white/10"
                }`}
              >
                {amount} SOL
              </button>
            ))}
          </div>

          {/* Wallet Balance Info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-xs text-[var(--text-muted)]">Your Balance</span>
            </div>
            <span className="text-sm font-mono text-[var(--text-primary)]">
              {isLoadingBalance ? (
                <span className="text-[var(--text-muted)]">Loading...</span>
              ) : walletBalance !== null ? (
                `${walletBalance.toFixed(4)} SOL`
              ) : (
                "—"
              )}
            </span>
          </div>

          {/* Cost Estimate */}
          <div className="p-3 rounded-lg bg-black/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Account Rent</span>
              <span className="text-[var(--text-secondary)]">~0.02 SOL</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Creation Fee</span>
              <span className="text-orange-400">0.1 SOL</span>
            </div>
            {initialBuy > 0 && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Initial Buy</span>
                  <span className="text-[var(--text-secondary)]">{initialBuy} SOL</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Transaction Fee (2%)</span>
                  <span className="text-[var(--text-secondary)]">{(initialBuy * 0.02).toFixed(4)} SOL</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
              <span className="font-medium text-[var(--text-primary)]">Estimated Total</span>
              <span className={`font-bold ${hasEnoughBalance ? 'text-orange-400' : 'text-red-400'}`}>
                ~{estimatedCost.toFixed(4)} SOL
              </span>
            </div>
          </div>

          {!hasEnoughBalance && walletBalance !== null && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-xs text-red-400">
                ⚠️ Insufficient balance. You need at least {estimatedCost.toFixed(4)} SOL but have {walletBalance.toFixed(4)} SOL.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Social Links */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-4">Social Links (Optional)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassInput
            label="Website"
            value={formData.website}
            onChange={(e) => updateFormData({ website: e.target.value })}
            placeholder="https://yoursite.com"
          />
          <GlassInput
            label="Twitter"
            value={formData.twitter}
            onChange={(e) => updateFormData({ twitter: e.target.value })}
            placeholder="https://twitter.com/yourtoken"
          />
          <GlassInput
            label="Telegram"
            value={formData.telegram}
            onChange={(e) => updateFormData({ telegram: e.target.value })}
            placeholder="https://t.me/yourgroup"
          />
          <GlassInput
            label="Discord"
            value={formData.discord}
            onChange={(e) => updateFormData({ discord: e.target.value })}
            placeholder="https://discord.gg/yourserver"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <GlassButton onClick={onNext} disabled={!isValid} variant="primary">
          Continue →
        </GlassButton>
      </div>
    </div>
  )
}

