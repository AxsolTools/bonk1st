"use client"

import type React from "react"
import type { TokenFormData } from "./launch-wizard"
import { useState, useEffect } from "react"
import { GlassInput, GlassTextarea, GlassButton, ImageUpload } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { DollarSign, Flame, Droplets } from "lucide-react"

interface StepBasicsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  creatorWallet?: string
  pool?: 'pump' | 'bonk'
  isUsd1Quote?: boolean
}

export function StepBasics({ 
  formData, 
  updateFormData, 
  onNext, 
  creatorWallet,
  pool = 'pump',
  isUsd1Quote = false
}: StepBasicsProps) {
  const { activeWallet, mainWallet } = useAuth()
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)

  const isBonkPool = pool === 'bonk'

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
          if (data.success && data.data) {
            setWalletBalance(data.data.balanceSol || 0)
          } else if (data.balance !== undefined) {
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
  // Cost breakdown: rent + creation fee + initial buy + slippage buffer
  const creationFee = isBonkPool ? 0.01 : 0.02 // Bonk has lower fees
  const estimatedCost = 0.02 + creationFee + initialBuy + (initialBuy * 0.05)
  const hasEnoughBalance = walletBalance !== null && walletBalance >= estimatedCost

  const isValid = 
    formData.name.length >= 2 && 
    formData.symbol.length >= 2 && 
    formData.symbol.length <= 10 &&
    initialBuy >= 0

  // Theme colors based on pool
  const themeColors = isBonkPool 
    ? {
        primary: 'amber-500',
        primaryHover: 'amber-400',
        bg: 'from-amber-500/10 to-yellow-500/10',
        border: 'amber-500/30',
        text: 'amber-400',
        icon: <DollarSign className="w-5 h-5 text-white" />
      }
    : {
        primary: 'aqua-primary',
        primaryHover: 'aqua-secondary',
        bg: 'from-cyan-500/10 to-blue-500/10',
        border: 'cyan-500/30',
        text: 'cyan-400',
        icon: <Droplets className="w-5 h-5 text-white" />
      }

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
            placeholder="e.g. Aqua Protocol"
            hint="Minimum 2 characters"
          />
          <GlassInput
            label="Token Symbol"
            value={formData.symbol}
            onChange={(e) => updateFormData({ symbol: e.target.value.toUpperCase() })}
            placeholder="e.g. AQUA"
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

      {/* Developer Initial Buy Section */}
      <div className={`p-5 rounded-xl bg-gradient-to-r ${themeColors.bg} border border-${themeColors.border}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isBonkPool 
              ? 'bg-gradient-to-br from-amber-500 to-yellow-500' 
              : 'bg-gradient-to-br from-cyan-500 to-blue-500'
          }`}>
            {themeColors.icon}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Developer Initial Buy</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isBonkPool 
                ? `Your first purchase on the bonding curve${isUsd1Quote ? ' (paid in SOL, converted to USD1)' : ''}`
                : 'Your first purchase on the bonding curve'
              }
            </p>
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
                className={`w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none transition-all ${
                  isBonkPool 
                    ? 'border-amber-500/30 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50'
                    : 'border-cyan-500/30 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className={`text-sm font-medium ${isBonkPool ? 'text-amber-400' : 'text-cyan-400'}`}>SOL</span>
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              This is your initial purchase as the creator. You'll receive tokens at the starting price on the bonding curve.
              {isUsd1Quote && ' Your SOL will be auto-converted to USD1 for the purchase.'}
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
                    ? isBonkPool 
                      ? "bg-amber-500 text-white"
                      : "bg-cyan-500 text-white"
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
              <div className={`w-2 h-2 rounded-full animate-pulse ${isBonkPool ? 'bg-amber-400' : 'bg-cyan-400'}`} />
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
              <span className={isBonkPool ? 'text-amber-400' : 'text-cyan-400'}>{creationFee} SOL</span>
            </div>
            {initialBuy > 0 && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Initial Buy</span>
                  <span className="text-[var(--text-secondary)]">{initialBuy} SOL</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Slippage Buffer (5%)</span>
                  <span className="text-[var(--text-secondary)]">{(initialBuy * 0.05).toFixed(4)} SOL</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
              <span className="font-medium text-[var(--text-primary)]">Estimated Total</span>
              <span className={`font-bold ${hasEnoughBalance ? (isBonkPool ? 'text-amber-400' : 'text-cyan-400') : 'text-red-400'}`}>
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
