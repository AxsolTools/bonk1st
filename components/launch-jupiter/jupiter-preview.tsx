"use client"

import { motion } from "framer-motion"
import { Droplets, Flame, TrendingUp, Users, ExternalLink } from "lucide-react"

// Custom Jupiter icon (planet with rings)
const JupiterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" />
    <ellipse cx="12" cy="12" rx="11" ry="3" />
    <path d="M5 12h14" strokeWidth="1.5" />
  </svg>
)
import { GlassPanel } from "@/components/ui/glass-panel"
import type { JupiterFormData } from "./jupiter-wizard"

interface JupiterPreviewProps {
  formData: JupiterFormData
}

export function JupiterPreview({ formData }: JupiterPreviewProps) {
  const supply = parseInt(formData.totalSupply) || 1000000000
  const initialBuy = parseFloat(formData.initialBuySol) || 0

  return (
    <GlassPanel className="rounded-2xl overflow-hidden">
      {/* Jupiter Header */}
      <div className="relative -mx-6 -mt-6 mb-6 p-6 bg-gradient-to-br from-orange-500/20 via-yellow-500/10 to-transparent">
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <JupiterIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-orange-400">Jupiter Studio</p>
            <p className="text-xs text-[var(--text-muted)]">Dynamic Bonding Curve</p>
          </div>
        </div>
      </div>

      {/* Token Preview Card */}
      <div className="space-y-6">
        {/* Token Image & Identity */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {formData.imagePreview ? (
              <motion.img
                key={formData.imagePreview}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={formData.imagePreview}
                alt="Token"
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-orange-500/30"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-yellow-500/20 flex items-center justify-center ring-2 ring-[var(--border-subtle)]">
                <span className="text-3xl text-[var(--text-muted)]">
                  {formData.symbol?.[0] || "?"}
                </span>
              </div>
            )}
            {/* Jupiter Badge */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center ring-2 ring-[var(--glass-bg)]">
              <JupiterIcon className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-[var(--text-primary)] truncate">
              {formData.name || "Token Name"}
            </h3>
            <p className="text-sm text-orange-400 font-medium">
              ${formData.symbol || "SYMBOL"}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {supply.toLocaleString()} supply
            </p>
          </div>
        </div>

        {/* Description */}
        {formData.description && (
          <p className="text-sm text-[var(--text-muted)] line-clamp-3">
            {formData.description}
          </p>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-[var(--text-muted)]">Pour Rate</span>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {formData.pourEnabled ? `${formData.pourRate}%` : "Off"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-[var(--text-muted)]">Evaporation</span>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {formData.evaporationEnabled ? `${formData.evaporationRate}%` : "Off"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-[var(--text-muted)]">Initial Buy</span>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {initialBuy > 0 ? `${initialBuy} SOL` : "None"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-[var(--text-muted)]">Bundle</span>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {formData.launchWithBundle ? `${formData.bundleWallets.length} wallets` : "Off"}
            </p>
          </div>
        </div>

        {/* Fee Distribution */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
          <p className="text-xs text-orange-400 mb-2">Fee Distribution</p>
          <div className="flex items-center gap-2">
            <div 
              className="h-2 rounded-full bg-blue-500" 
              style={{ width: `${formData.feeToLiquidity}%` }}
            />
            <div 
              className="h-2 rounded-full bg-orange-500" 
              style={{ width: `${formData.feeToCreator}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
            <span>{formData.feeToLiquidity}% Liquidity</span>
            <span>{formData.feeToCreator}% Creator</span>
          </div>
        </div>

        {/* Social Links */}
        {(formData.website || formData.twitter || formData.telegram) && (
          <div className="flex items-center gap-2 flex-wrap">
            {formData.website && (
              <a
                href={formData.website}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-orange-500/30 transition-colors flex items-center gap-1"
              >
                Website
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {formData.twitter && (
              <a
                href={`https://twitter.com/${formData.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-orange-500/30 transition-colors"
              >
                @{formData.twitter.replace('@', '')}
              </a>
            )}
            {formData.telegram && (
              <a
                href={`https://t.me/${formData.telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-orange-500/30 transition-colors"
              >
                Telegram
              </a>
            )}
          </div>
        )}

        {/* Jupiter DBC Info */}
        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Pool Type</span>
            <span className="text-orange-400 font-medium flex items-center gap-1">
              <JupiterIcon className="w-3 h-3" />
              Jupiter DBC
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-[var(--text-muted)]">Migration Target</span>
            <span className="text-[var(--text-primary)] capitalize">
              {formData.migrationTarget} @ {formData.migrationThreshold}%
            </span>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

