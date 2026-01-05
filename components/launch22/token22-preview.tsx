"use client"

import type { Token22FormData } from "./token22-wizard"

interface Token22PreviewProps {
  formData: Token22FormData
}

export function Token22Preview({ formData }: Token22PreviewProps) {
  // Calculate preview values
  const totalSupply = parseFloat(formData.totalSupply) || 1000000000
  const lpTokens = totalSupply * (formData.lpAllocation / 100)
  const solAmount = parseFloat(formData.poolSolAmount) || 1
  const pricePerToken = lpTokens > 0 ? solAmount / lpTokens : 0
  const initialMarketCap = pricePerToken * totalSupply

  return (
    <div className="glass-panel-elevated p-5 rounded-xl sticky top-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Live Preview</h3>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-400">Token-2022</span>
        </div>
      </div>

      {/* Token Card */}
      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        {/* Token Identity */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center overflow-hidden">
            {formData.imagePreview ? (
              <img src={formData.imagePreview} alt="Token" className="w-full h-full object-cover" />
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

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-[var(--bg-elevated)]">
            <p className="text-[10px] text-[var(--text-muted)]">Supply</p>
            <p className="text-xs font-mono text-[var(--text-primary)]">
              {totalSupply.toLocaleString()}
            </p>
          </div>
          <div className="p-2 rounded bg-[var(--bg-elevated)]">
            <p className="text-[10px] text-[var(--text-muted)]">Price</p>
            <p className="text-xs font-mono text-purple-400">
              {pricePerToken > 0 
                ? (pricePerToken < 0.000001 ? pricePerToken.toExponential(2) : pricePerToken.toFixed(6))
                : "—"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mt-4">
        <h4 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Extensions</h4>
        
        <div className="space-y-2">
          {/* Transfer Fee */}
          <div className={`flex items-center justify-between p-2.5 rounded-lg ${
            formData.enableTransferFee ? 'bg-amber-500/10' : 'bg-[var(--bg-secondary)]'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${
                formData.enableTransferFee ? 'bg-amber-500/20' : 'bg-[var(--bg-elevated)]'
              }`}>
                <svg className={`w-3.5 h-3.5 ${formData.enableTransferFee ? 'text-amber-400' : 'text-[var(--text-muted)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Transfer Fee</span>
            </div>
            <span className={`text-xs font-mono ${formData.enableTransferFee ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
              {formData.enableTransferFee ? `${(formData.transferFeeBasisPoints / 100).toFixed(2)}%` : 'Off'}
            </span>
          </div>

          {/* Mint Authority */}
          <div className={`flex items-center justify-between p-2.5 rounded-lg ${
            formData.revokeMintAuthority ? 'bg-emerald-500/10' : 'bg-[var(--bg-secondary)]'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${
                formData.revokeMintAuthority ? 'bg-emerald-500/20' : 'bg-[var(--bg-elevated)]'
              }`}>
                <svg className={`w-3.5 h-3.5 ${formData.revokeMintAuthority ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Mint Auth</span>
            </div>
            <span className={`text-xs font-mono ${formData.revokeMintAuthority ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formData.revokeMintAuthority ? 'Revoked' : 'Active'}
            </span>
          </div>

          {/* Raydium Pool */}
          <div className={`flex items-center justify-between p-2.5 rounded-lg ${
            formData.autoCreatePool ? 'bg-[var(--aqua-bg)]' : 'bg-[var(--bg-secondary)]'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${
                formData.autoCreatePool ? 'bg-[var(--aqua-primary)]/20' : 'bg-[var(--bg-elevated)]'
              }`}>
                <svg className={`w-3.5 h-3.5 ${formData.autoCreatePool ? 'text-[var(--aqua-primary)]' : 'text-[var(--text-muted)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Raydium</span>
            </div>
            <span className={`text-xs font-mono ${formData.autoCreatePool ? 'text-[var(--aqua-primary)]' : 'text-[var(--text-muted)]'}`}>
              {formData.autoCreatePool ? `${formData.poolSolAmount} SOL` : 'Manual'}
            </span>
          </div>
        </div>
      </div>

      {/* Distribution */}
      <div className="mt-4">
        <h4 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Distribution</h4>
        
        <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
          <div 
            className="h-full bg-blue-500" 
            style={{ width: `${formData.teamAllocation}%` }}
          />
          <div 
            className="h-full bg-[var(--aqua-primary)]" 
            style={{ width: `${formData.lpAllocation}%` }}
          />
          <div 
            className="h-full bg-amber-500" 
            style={{ width: `${formData.lockedAllocation}%` }}
          />
        </div>
        
        <div className="flex justify-between mt-2 text-[10px]">
          <span className="text-blue-400">Team {formData.teamAllocation}%</span>
          <span className="text-[var(--aqua-primary)]">LP {formData.lpAllocation}%</span>
          <span className="text-amber-400">Lock {formData.lockedAllocation}%</span>
        </div>
      </div>

      {/* Market Cap */}
      {formData.autoCreatePool && (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Est. Market Cap</span>
            <span className="text-sm font-semibold text-purple-400">
              {initialMarketCap.toFixed(2)} SOL
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
