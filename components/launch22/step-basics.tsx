"use client"

import type { Token22FormData } from "./token22-wizard"
import { GlassInput, GlassTextarea, GlassButton, ImageUpload } from "@/components/ui/glass-panel"

interface Step22BasicsProps {
  formData: Token22FormData
  updateFormData: (updates: Partial<Token22FormData>) => void
  onNext: () => void
}

export function Step22Basics({ formData, updateFormData, onNext }: Step22BasicsProps) {
  const handleImageChange = (file: File | null, preview: string | null) => {
    updateFormData({
      imageFile: file,
      imagePreview: preview,
    })
  }

  const isValid = formData.name.length >= 2 && formData.symbol.length >= 2 && formData.symbol.length <= 10

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <span className="text-lg">🪙</span>
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-400">Token-2022 Standard</p>
          <p className="text-xs text-white/60">Advanced features, full control, Raydium liquidity</p>
        </div>
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
            placeholder="e.g. Degen Protocol"
            hint="2-32 characters. Make it memorable."
          />
          <GlassInput
            label="Token Symbol"
            value={formData.symbol}
            onChange={(e) => updateFormData({ symbol: e.target.value.toUpperCase() })}
            placeholder="e.g. DGEN"
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
        placeholder="What's your token about? Degens love a good story..."
        rows={4}
        maxLength={500}
        charCount={formData.description.length}
        maxChars={500}
      />

      {/* Social Links */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-4">Social Links (Optional but recommended)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassInput
            label="Website"
            value={formData.website}
            onChange={(e) => updateFormData({ website: e.target.value })}
            placeholder="https://yourtoken.com"
          />
          <GlassInput
            label="Twitter / X"
            value={formData.twitter}
            onChange={(e) => updateFormData({ twitter: e.target.value })}
            placeholder="https://x.com/yourtoken"
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
          Continue to Extensions →
        </GlassButton>
      </div>
    </div>
  )
}

