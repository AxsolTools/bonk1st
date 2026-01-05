"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Wifi,
  RefreshCw,
  Bell,
  Settings,
  ExternalLink,
  X,
  Volume2,
  VolumeX,
} from "lucide-react"
import { fetchSolPrice } from "@/lib/solana-rpc"

export function TerminalHeader() {
  const [solPrice, setSolPrice] = useState(178.5)
  const [priceChange, setPriceChange] = useState(2.45)
  const [isConnected, setIsConnected] = useState(true)
  const [currentTime, setCurrentTime] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    fetchSolPrice().then(setSolPrice)
    const priceInterval = setInterval(async () => {
      const price = await fetchSolPrice()
      setSolPrice(price)
    }, 30000)

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("en-US", { hour12: false }))
    }, 1000)

    return () => {
      clearInterval(priceInterval)
      clearInterval(timeInterval)
    }
  }, [])

  const totalKOLs = 250

  return (
    <>
      <header className="bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src="/funko-logo.webp"
                  alt="FUN.KOL"
                  className="w-11 h-11 rounded-xl shadow-lg shadow-purple-500/30"
                />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00ff88] rounded-full animate-ping" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight">
                  FUN<span className="text-[#00ff88]">.</span>KOL
                </h1>
                <p className="text-[10px] text-neutral-500 -mt-0.5 tracking-widest">DEGEN ALPHA TERMINAL</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20">
              <Wifi className="w-3.5 h-3.5 text-[#00ff88]" />
              <span className="text-[#00ff88] text-xs font-bold">LIVE</span>
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            </div>
          </div>

          {/* Center Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-[#111] px-4 py-2 rounded-xl border border-[#1a1a1a]">
              <img
                src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                alt="SOL"
                className="w-7 h-7"
              />
              <div>
                <div className="text-white font-bold text-lg">${solPrice.toFixed(2)}</div>
                <div
                  className={`text-xs flex items-center gap-1 ${priceChange >= 0 ? "text-[#00ff88]" : "text-red-500"}`}
                >
                  {priceChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="bg-[#111] px-4 py-2 rounded-xl border border-[#1a1a1a] text-center">
              <div className="text-[10px] text-neutral-500">UTC TIME</div>
              <div className="text-lg font-mono text-white font-bold">{currentTime}</div>
            </div>

            <div className="flex items-center gap-3 bg-[#111] px-4 py-2 rounded-xl border border-[#1a1a1a]">
              <Activity className="w-5 h-5 text-[#00ff88]" />
              <div>
                <div className="text-[10px] text-neutral-500">TRACKING</div>
                <div className="text-white font-bold text-lg">{totalKOLs} KOLs</div>
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <a
              href="https://x.com/vexorsol"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white font-bold text-sm rounded-xl hover:bg-[#222] transition-colors border border-[#333]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Community
            </a>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl transition-colors ${soundEnabled ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#1a1a1a] text-neutral-500"}`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button className="p-2.5 hover:bg-[#1a1a1a] rounded-xl transition-colors text-neutral-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>

            <button className="p-2.5 hover:bg-[#1a1a1a] rounded-xl transition-colors text-neutral-400 hover:text-white relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 hover:bg-[#1a1a1a] rounded-xl transition-colors text-neutral-400 hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </button>

            <a
              href="https://pump.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00ff88] to-[#00dd77] text-black font-black text-sm rounded-xl hover:opacity-90 transition-opacity"
            >
              pump.fun
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-white">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-[#222] rounded-xl text-neutral-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { key: "sound", label: "Sound Effects", desc: "Alert sounds for new alpha" },
                { key: "notifications", label: "Push Notifications", desc: "Browser notifications" },
                { key: "autoRefresh", label: "Auto Refresh", desc: "Update data every 5s" },
                { key: "showWashTraders", label: "Show Wash Traders", desc: "Display in Wall of Shame" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-xl">
                  <div>
                    <div className="text-white font-medium">{label}</div>
                    <div className="text-xs text-neutral-500">{desc}</div>
                  </div>
                  <button className="w-12 h-6 rounded-full transition-colors bg-[#00ff88]">
                    <div className="w-5 h-5 rounded-full bg-white translate-x-6 transition-transform" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-6 py-3 bg-[#00ff88] text-black font-black rounded-xl hover:bg-[#00dd77] transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </>
  )
}
