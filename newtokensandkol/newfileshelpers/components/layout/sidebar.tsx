"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  TrendingUp,
  Settings,
  Activity,
  Radio,
  Zap,
  Users,
  Bell,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Search, label: "Twitter Scanner", href: "/scanner" },
  { icon: Filter, label: "Custom Aggregators", href: "/aggregators" },
  { icon: TrendingUp, label: "Trending Tokens", href: "/trending" },
  { icon: Activity, label: "Volume Gems", href: "/volume" },
  { icon: Bell, label: "MC Alerts", href: "/alerts" },
  { icon: Radio, label: "Social Monitors", href: "/social" },
  { icon: Zap, label: "DEX Paid", href: "/dex-paid" },
  { icon: Users, label: "Fresh Wallets", href: "/wallets" },
]

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const pathname = usePathname()

  const connectPhantomWallet = async () => {
    try {
      const { solana } = window as any

      if (!solana?.isPhantom) {
        window.open("https://phantom.app/", "_blank")
        return
      }

      const response = await solana.connect()
      const address = response.publicKey.toString()
      setWalletAddress(address)
      setWalletConnected(true)
    } catch (error) {
      console.error("Failed to connect wallet:", error)
    }
  }

  const disconnectWallet = async () => {
    try {
      const { solana } = window as any
      if (solana?.isPhantom) {
        await solana.disconnect()
      }
      setWalletConnected(false)
      setWalletAddress(null)
    } catch (error) {
      console.error("Failed to disconnect wallet:", error)
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/vexorscan-logo.png"
            alt="VexorScan"
            width={collapsed ? 32 : 120}
            height={32}
            className="object-contain"
          />
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        <a
          href="https://www.funkol.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Image src="/funkol-logo.webp" alt="FUN.KOL" width={20} height={20} className="h-5 w-5 shrink-0 rounded" />
          {!collapsed && <span>FUN.KOL</span>}
        </a>

        <button
          onClick={walletConnected ? disconnectWallet : connectPhantomWallet}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            walletConnected
              ? "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {!collapsed && (
            <span className="truncate">
              {walletConnected && walletAddress ? formatAddress(walletAddress) : "Connect Wallet"}
            </span>
          )}
          {collapsed && <span className="text-xs">Wallet</span>}
        </button>

        <a
          href="https://pump.fun/coin/J2kcLnwgceDppruGiWDEwyHGuMUJ1vLZVM5AoUiPpump"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
            "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30",
          )}
        >
          {!collapsed && <span>BUY VEXOR</span>}
          {collapsed && <span className="text-xs">BUY</span>}
        </a>
      </nav>

      <div className="border-t border-border p-3 space-y-1">
        <a
          href="https://x.com/vexorsol"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <XIcon className="h-5 w-5 shrink-0" />
        </a>
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </aside>
  )
}
