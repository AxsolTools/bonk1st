import { Header } from "@/components/layout/header"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import Link from "next/link"

export default function DemoCreatePage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      <div className="px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="glass-panel-elevated p-8 rounded-lg space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Create a Token</h1>
              <p className="text-[var(--text-muted)]">Deploy your token with infinite liquidity mechanics</p>
            </div>

            {/* Token Details Form Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Token Details</h2>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Token Name</label>
                <input type="text" placeholder="e.g., Pump Swap" className="input w-full" defaultValue="Pump Swap" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g., SWAP"
                    className="input w-full"
                    maxLength={10}
                    defaultValue="SWAP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Decimals</label>
                  <input type="number" placeholder="6" className="input w-full" defaultValue="6" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Description</label>
                <textarea
                  placeholder="Describe your token..."
                  className="input w-full h-24"
                  defaultValue="A revolutionary DeFi token powering decentralized exchanges with infinite liquidity mechanics"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Token Image</label>
                <div className="border-2 border-dashed border-[var(--border-default)] rounded-lg p-6 text-center hover:border-[var(--aqua-primary)] transition-colors cursor-pointer">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="mx-auto mb-2 text-[var(--text-muted)]"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="1.5" />
                    <polyline points="17 8 12 3 7 8" strokeWidth="1.5" />
                    <line x1="12" y1="3" x2="12" y2="15" strokeWidth="1.5" />
                  </svg>
                  <p className="text-sm text-[var(--text-muted)]">Click to upload or drag and drop</p>
                </div>
              </div>
            </div>

            {/* AQUA Parameters */}
            <div className="space-y-4 border-t border-[var(--border-subtle)] pt-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">AQUA Parameters</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Pour Rate (SOL/min)
                  </label>
                  <input type="number" step="0.1" className="input w-full" defaultValue="250" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Evaporation Rate (%)
                  </label>
                  <input type="number" step="0.1" className="input w-full" defaultValue="15" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Initial Liquidity (SOL)
                </label>
                <input type="number" step="0.1" className="input w-full" defaultValue="5" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Link href="/" className="flex-1 btn-secondary text-center">
                Cancel
              </Link>
              <button className="flex-1 btn-primary">Create Token</button>
            </div>

            <p className="text-xs text-[var(--text-dim)] text-center">
              Creating a token requires a wallet connection and will incur a small deployment fee.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
