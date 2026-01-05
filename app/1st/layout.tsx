import type { Metadata } from "next"
import { FirstHeader, FirstFooter } from "@/components/1st/layout/1st-header"
import { WalletOnboarding1st } from "@/components/1st/wallet/wallet-onboarding-1st"
import "@/components/1st/theme/gold-theme.css"

export const metadata: Metadata = {
  title: "BONK1ST | DeGEN Sniper - Be First on Solana",
  description: "Real-time token sniping platform for BONK USD1/SOL pairs. wanna be first? use BONK1ST",
  icons: {
    icon: "/1st-favicon.png",
    apple: "/1st-logo.png",
  },
}

export default function FirstLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Subtle grid background */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(212, 175, 55, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212, 175, 55, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Gold accent glow at top */}
      <div 
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(212, 175, 55, 0.08) 0%, transparent 70%)',
        }}
      />
      
      {/* Header */}
      <FirstHeader />
      
      {/* Main Content */}
      <main className="relative pb-12">
        {children}
      </main>
      
      {/* Footer Status Bar */}
      <FirstFooter />
      
      {/* Gold-themed Wallet Onboarding Modal */}
      <WalletOnboarding1st />
    </div>
  )
}

