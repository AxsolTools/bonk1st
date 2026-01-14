import type React from "react"
import type { Metadata, Viewport } from "next"
import { Space_Grotesk, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import "@/components/1st/theme/gold-theme.css"
import { AuthProvider } from "@/components/providers/auth-provider"
import { FirstHeader, FirstFooter } from "@/components/1st/layout/1st-header"
import { WalletManager1st } from "@/components/1st/wallet/wallet-manager-1st"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "BONK1ST | DeGEN Sniper - Be First on Solana",
  description:
    "Real-time token sniping platform for BONK USD1/SOL pairs. wanna be first? use BONK1ST",
  keywords: [
    "solana",
    "sniper",
    "bonk",
    "usd1",
    "trading",
    "defi",
    "token",
    "crypto",
    "bonk1st",
    "first",
  ],
  authors: [{ name: "BONK1ST" }],
  icons: {
    icon: "/1st-favicon.png",
    apple: "/1st-logo.png",
  },
  openGraph: {
    title: "BONK1ST | DeGEN Sniper - Be First on Solana",
    description:
      "Real-time token sniping platform for BONK USD1/SOL pairs. wanna be first? use BONK1ST",
    type: "website",
    siteName: "BONK1ST",
    images: ["/1st-logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "BONK1ST | DeGEN Sniper",
    description: "wanna be first? use BONK1ST",
    images: ["/1st-logo.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <div 
            className="min-h-screen bg-[#000000] text-white"
            style={{
              '--aqua-primary': '#D4AF37',
              '--aqua-secondary': '#B8960F',
              '--aqua-tertiary': '#8B7355',
              '--aqua-glow': 'rgba(212, 175, 55, 0.5)',
              '--aqua-bg': 'rgba(212, 175, 55, 0.08)',
              '--aqua-border': 'rgba(212, 175, 55, 0.2)',
              '--bg-primary': '#000000',
              '--bg-secondary': '#0A0A0A',
              '--bg-card': '#111111',
              '--bg-card-hover': '#1A1A1A',
              '--bg-elevated': '#161616',
              '--bg-input': '#050505',
              '--border-subtle': 'rgba(212, 175, 55, 0.1)',
              '--border-default': 'rgba(212, 175, 55, 0.15)',
              '--border-highlight': 'rgba(212, 175, 55, 0.25)',
              '--primary': '#D4AF37',
              '--ring': '#D4AF37',
            } as React.CSSProperties}
          >
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
            
            {/* Wallet Manager - handles all wallet operations */}
            <WalletManager1st />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
