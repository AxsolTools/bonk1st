"use client"

import type { TokenFormData } from "./launch-wizard"

interface TokenPreviewProps {
  formData: TokenFormData
}

export function TokenPreview({ formData }: TokenPreviewProps) {
  return (
    <div className="glass-panel-elevated p-5 rounded-xl sticky top-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Live Preview</h3>
        <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
      </div>

      {/* Token Card */}
      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        {/* Token Identity */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center overflow-hidden">
            {formData.imagePreview ? (
              <img
                src={formData.imagePreview}
                alt="Token"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-[var(--text-muted)]">
                {formData.symbol?.charAt(0) || "?"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-[var(--text-primary)] truncate">
              {formData.name || "Token Name"}
            </h4>
            <p className="text-sm text-[var(--text-muted)] font-mono">
              ${formData.symbol || "SYMBOL"}
            </p>
          </div>
        </div>

        {/* Supply */}
        <div className="flex items-center justify-between py-2 border-t border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-muted)]">Total Supply</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">
            {Number(formData.totalSupply || 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* AQUA Settings */}
      <div className="mt-4">
        <h4 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">AQUA Settings</h4>
        
        <div className="space-y-2">
          {/* Pour Rate */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[var(--aqua-bg)] flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-[var(--aqua-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Pour Rate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-[var(--aqua-primary)]">{formData.pourRate}%</span>
              {formData.pourEnabled ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--green-bg)] text-[var(--green)]">ON</span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">OFF</span>
              )}
            </div>
          </div>

          {/* Evaporation */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[var(--warm-bg)] flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-[var(--warm)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Evaporation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-[var(--warm)]">{formData.evaporationRate}%</span>
              {formData.evaporationEnabled ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--green-bg)] text-[var(--green)]">ON</span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">OFF</span>
              )}
            </div>
          </div>

          {/* Fee Distribution */}
          <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Fee Split</span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 text-center p-1.5 rounded bg-[var(--bg-elevated)]">
                <p className="text-[10px] text-[var(--text-muted)]">Liquidity</p>
                <p className="text-xs font-mono text-[var(--aqua-primary)]">{formData.feeToLiquidity}%</p>
              </div>
              <div className="flex-1 text-center p-1.5 rounded bg-[var(--bg-elevated)]">
                <p className="text-[10px] text-[var(--text-muted)]">Creator</p>
                <p className="text-xs font-mono text-[var(--green)]">{formData.feeToCreator}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Migration */}
      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">Migration</span>
          <span className="text-xs font-medium text-[var(--text-primary)] capitalize">{formData.migrationTarget}</span>
        </div>
      </div>
    </div>
  )
}
