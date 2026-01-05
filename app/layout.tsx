import type React from "react"
import type { Metadata, Viewport } from "next"
import { Space_Grotesk, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/providers/auth-provider"
import { WalletOnboarding } from "@/components/wallet/wallet-onboarding"
import { LiquidBackground } from "@/components/visuals/liquid-background"

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
  title: "Propel | Infinite Liquidity Launchpad",
  description:
    "The next-generation Solana token launchpad with continuous liquidity flow. Pour Rate technology ensures your token never runs dry.",
  keywords: [
    "solana",
    "launchpad",
    "liquidity",
    "defi",
    "token",
    "crypto",
    "propel",
    "pump.fun",
    "infinite liquidity",
  ],
  authors: [{ name: "Propel" }],
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Propel | Infinite Liquidity Launchpad",
    description:
      "The next-generation Solana token launchpad with continuous liquidity flow. Pour Rate technology keeps liquidity flowing eternally.",
    type: "website",
    siteName: "Propel Launchpad",
    images: ["/propelweblogo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Propel | Infinite Liquidity Launchpad",
    description: "Pour Rate technology ensures your token never runs dry",
    images: ["/propelweblogo.png"],
  },
    generator: 'v0.app'
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
          <LiquidBackground />
          {children}
          <WalletOnboarding />
        </AuthProvider>
      </body>
    </html>
  )
}
