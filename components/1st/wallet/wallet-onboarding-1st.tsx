"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"
import { GoldButton } from "../ui/gold-button"
import { GoldInput } from "../ui/gold-input"
import { GoldCard } from "../ui/gold-card"

type OnboardingStep = "choice" | "generate" | "import" | "backup" | "complete"

interface GeneratedWallet {
  publicKey: string
  secretKey: string
  mnemonic: string
  label: string
}

interface ImportedWallet {
  publicKey: string
  label: string
  success: boolean
  error?: string
}

export function WalletOnboarding1st() {
  const { isOnboarding, setIsOnboarding, refreshWallets, userId, setUserId, wallets } = useAuth()
  const [step, setStep] = useState<OnboardingStep>("choice")
  
  // Multi-wallet generation
  const [walletCount, setWalletCount] = useState(1)
  const [generatedWallets, setGeneratedWallets] = useState<GeneratedWallet[]>([])
  const [currentWalletIndex, setCurrentWalletIndex] = useState(0)
  
  // Multi-wallet import
  const [importLines, setImportLines] = useState("")
  const [importedWallets, setImportedWallets] = useState<ImportedWallet[]>([])
  
  const [walletLabel, setWalletLabel] = useState("")
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"phrase" | "key">("phrase")

  // Calculate max wallets allowed (25 - current count)
  const existingWalletCount = wallets?.length || 0
  const maxNewWallets = Math.min(5, 25 - existingWalletCount)

  if (!isOnboarding) return null

  const handleGenerateWallets = async () => {
    setIsProcessing(true)
    setError("")
    const generated: GeneratedWallet[] = []

    try {
      for (let i = 0; i < walletCount; i++) {
        const label = walletCount === 1 
          ? (walletLabel || "BONK1ST Wallet")
          : `${walletLabel || "BONK1ST"} ${i + 1}`

        const response = await fetch("/api/wallet/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            sessionId: userId,
          }),
        })

        const data = await response.json()

        if (!response.ok) throw new Error(data.error?.message || data.error || `Failed to generate wallet ${i + 1}`)

        if (data.data?.sessionId && !userId) {
          setUserId(data.data.sessionId)
        }

        generated.push({
          publicKey: data.data?.publicKey || data.publicKey,
          secretKey: data.data?.secretKey || data.secretKey || "",
          mnemonic: data.data?.mnemonic || data.mnemonic,
          label,
        })
      }

      setGeneratedWallets(generated)
      setCurrentWalletIndex(0)
      setStep("backup")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate wallets")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportWallets = async () => {
    setIsProcessing(true)
    setError("")
    
    const lines = importLines.trim().split('\n').filter(line => line.trim())
    
    if (lines.length === 0) {
      setError("Enter at least one private key, degen")
      setIsProcessing(false)
      return
    }

    if (lines.length > maxNewWallets) {
      setError(`Max ${maxNewWallets} wallets (${existingWalletCount}/25 slots used)`)
      setIsProcessing(false)
      return
    }

    const results: ImportedWallet[] = []

    for (let i = 0; i < lines.length; i++) {
      const secretKey = lines[i].trim()
      const label = walletLabel 
        ? (lines.length === 1 ? walletLabel : `${walletLabel} ${i + 1}`)
        : `Imported ${i + 1}`

      try {
        const response = await fetch("/api/wallet/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secretKey,
            label,
            sessionId: userId,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          results.push({
            publicKey: "",
            label,
            success: false,
            error: data.error?.message || data.error || "Failed",
          })
        } else {
          if (data.data?.sessionId && !userId) {
            setUserId(data.data.sessionId)
          }

          results.push({
            publicKey: data.data?.publicKey || data.publicKey || "",
            label,
            success: true,
          })
        }
      } catch (err) {
        results.push({
          publicKey: "",
          label,
          success: false,
          error: err instanceof Error ? err.message : "Failed",
        })
      }
    }

    setImportedWallets(results)
    
    const successCount = results.filter(r => r.success).length
    if (successCount > 0) {
      await refreshWallets()
    }
    
    setStep("complete")
    setIsProcessing(false)
  }

  const handleBackupComplete = async () => {
    if (!backupConfirmed) {
      setError("Confirm you saved your keys, fren")
      return
    }

    if (currentWalletIndex < generatedWallets.length - 1) {
      setCurrentWalletIndex(prev => prev + 1)
      setBackupConfirmed(false)
      setActiveTab("phrase")
      return
    }

    await refreshWallets()
    setStep("complete")
  }

  const handleClose = () => {
    setIsOnboarding(false)
    setStep("choice")
    setGeneratedWallets([])
    setImportedWallets([])
    setImportLines("")
    setWalletLabel("")
    setBackupConfirmed(false)
    setError("")
    setActiveTab("phrase")
    setWalletCount(1)
    setCurrentWalletIndex(0)
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const currentWallet = generatedWallets[currentWalletIndex]

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#000000]"
        onClick={handleClose}
      >
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(212,175,55,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,.3) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        {/* Gold glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FFD700]/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-[110] p-3 rounded-xl bg-[#0A0A0A]/80 backdrop-blur-sm border border-[#D4AF37]/20 text-white/50 hover:text-[#D4AF37] hover:border-[#D4AF37]/50 transition-all"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="w-full max-w-xl"
        >
          <AnimatePresence mode="wait">
            {/* CHOICE STEP */}
            {step === "choice" && (
              <motion.div
                key="choice"
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/10 border border-[#D4AF37]/30 mb-6 shadow-[0_0_30px_rgba(212,175,55,0.3)]"
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                    </svg>
                  </motion.div>
                  <h1 className="text-3xl font-bold text-[#D4AF37] mb-3">BONK1ST</h1>
                  <p className="text-white/60 text-lg">wanna be first? Connect your wallet</p>
                  {existingWalletCount > 0 && (
                    <p className="text-sm text-white/30 mt-2">
                      {existingWalletCount}/25 wallets loaded
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={() => setStep("generate")}
                    disabled={maxNewWallets === 0}
                    className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#D4AF37]/10 to-[#FFD700]/10 border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] transition-all p-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center group-hover:scale-110 transition-transform border border-[#D4AF37]/30">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-white mb-1">Generate Wallet</h3>
                        <p className="text-white/50">Create up to {maxNewWallets} fresh wallets</p>
                      </div>
                      <span className="text-2xl">🎯</span>
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setStep("import")}
                    disabled={maxNewWallets === 0}
                    className="w-full group relative overflow-hidden rounded-2xl bg-[#0A0A0A]/80 border border-white/10 hover:border-[#D4AF37]/40 transition-all p-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform border border-white/10">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="opacity-60">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-white mb-1">Import Wallet</h3>
                        <p className="text-white/50">Load existing private keys</p>
                      </div>
                    </div>
                  </motion.button>
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center justify-center gap-2 text-white/40"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span className="text-sm">Keys encrypted locally</span>
                </motion.div>
              </motion.div>
            )}

            {/* GENERATE STEP */}
            {step === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-6"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 text-white/50 hover:text-[#D4AF37] transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-[#D4AF37] mb-2">Generate Wallets</h2>
                  <p className="text-white/50">Create up to {maxNewWallets} sniping wallets</p>
                </div>

                <GoldCard variant="elevated" className="space-y-5">
                  {/* Wallet Count Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">
                      How many wallets?
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setWalletCount(Math.max(1, walletCount - 1))}
                        disabled={walletCount <= 1}
                        className="w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] hover:border-[#D4AF37]/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <span className="text-xl font-bold">−</span>
                      </button>
                      <div className="flex-1 h-12 rounded-xl bg-[#0A0A0A] border border-[#D4AF37]/30 flex items-center justify-center">
                        <span className="text-3xl font-bold text-[#D4AF37]">{walletCount}</span>
                      </div>
                      <button
                        onClick={() => setWalletCount(Math.min(maxNewWallets, walletCount + 1))}
                        disabled={walletCount >= maxNewWallets}
                        className="w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] hover:border-[#D4AF37]/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <span className="text-xl font-bold">+</span>
                      </button>
                    </div>
                    <div className="flex justify-center gap-2 mt-3">
                      {[1, 2, 3, 4, 5].slice(0, maxNewWallets).map((num) => (
                        <button
                          key={num}
                          onClick={() => setWalletCount(num)}
                          className={cn(
                            "w-10 h-10 rounded-lg text-sm font-bold transition-all",
                            walletCount === num
                              ? "bg-gradient-to-b from-[#FFD700] to-[#D4AF37] text-black"
                              : "bg-[#0A0A0A] text-white/50 hover:text-[#D4AF37] border border-white/10"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <GoldInput
                    label={`Wallet Name ${walletCount > 1 ? 'Prefix' : ''}`}
                    value={walletLabel}
                    onChange={(e) => setWalletLabel(e.target.value)}
                    placeholder={walletCount === 1 ? "BONK1ST Sniper" : "Sniper"}
                    hint={walletCount > 1 ? `Creates: "${walletLabel || 'Sniper'} 1", "${walletLabel || 'Sniper'} 2", etc.` : undefined}
                  />

                  {error && (
                    <div className="p-3 rounded-lg bg-[#FF3333]/10 border border-[#FF3333]/30 flex items-start gap-2">
                      <span className="text-[#FF3333]">⚠</span>
                      <p className="text-sm text-[#FF3333]">{error}</p>
                    </div>
                  )}

                  <GoldButton
                    variant="primary"
                    className="w-full h-14 text-lg"
                    onClick={handleGenerateWallets}
                    loading={isProcessing}
                    glow
                  >
                    {isProcessing 
                      ? `Generating ${walletCount} wallet${walletCount > 1 ? 's' : ''}...`
                      : `🎯 Generate ${walletCount} Wallet${walletCount > 1 ? 's' : ''}`
                    }
                  </GoldButton>
                </GoldCard>
              </motion.div>
            )}

            {/* IMPORT STEP */}
            {step === "import" && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-6"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 text-white/50 hover:text-[#D4AF37] transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-[#D4AF37] mb-2">Import Wallets</h2>
                  <p className="text-white/50">Paste private keys (one per line, max {maxNewWallets})</p>
                </div>

                <GoldCard variant="elevated" className="space-y-5">
                  <GoldInput
                    label="Wallet Name Prefix"
                    value={walletLabel}
                    onChange={(e) => setWalletLabel(e.target.value)}
                    placeholder="Imported"
                  />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Private Keys
                      </label>
                      <span className="text-xs text-white/30">
                        {importLines.trim().split('\n').filter(l => l.trim()).length} / {maxNewWallets}
                      </span>
                    </div>
                    <textarea
                      value={importLines}
                      onChange={(e) => setImportLines(e.target.value)}
                      placeholder={`Paste keys here, one per line...\n\n5abc...xyz\n4def...uvw`}
                      rows={6}
                      className="w-full px-3 py-3 bg-[#000000] border border-[#D4AF37]/20 rounded-lg text-white font-mono text-sm resize-none focus:border-[#D4AF37] focus:outline-none transition-colors placeholder:text-white/20"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-[#FF3333]/10 border border-[#FF3333]/30 flex items-start gap-2">
                      <span className="text-[#FF3333]">⚠</span>
                      <p className="text-sm text-[#FF3333]">{error}</p>
                    </div>
                  )}

                  <GoldButton
                    variant="primary"
                    className="w-full h-14 text-lg"
                    onClick={handleImportWallets}
                    loading={isProcessing}
                    disabled={!importLines.trim()}
                    glow
                  >
                    {isProcessing ? 'Importing...' : '📥 Import Wallets'}
                  </GoldButton>
                </GoldCard>
              </motion.div>
            )}

            {/* BACKUP STEP */}
            {step === "backup" && currentWallet && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-5"
              >
                {/* Progress */}
                {generatedWallets.length > 1 && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {generatedWallets.map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-3 h-3 rounded-full transition-all",
                          idx < currentWalletIndex
                            ? "bg-[#00FF41]"
                            : idx === currentWalletIndex
                            ? "bg-[#D4AF37] scale-125 shadow-[0_0_10px_rgba(212,175,55,0.5)]"
                            : "bg-white/20"
                        )}
                      />
                    ))}
                  </div>
                )}

                {/* Warning */}
                <GoldCard variant="highlight" glow className="text-center">
                  <div className="text-4xl mb-3">⚠️</div>
                  <h2 className="text-xl font-bold text-[#FFD700] mb-1">
                    {generatedWallets.length > 1 
                      ? `Backup ${currentWalletIndex + 1}/${generatedWallets.length}`
                      : "Save Your Keys!"
                    }
                  </h2>
                  <p className="text-sm text-white/60">{currentWallet.label}</p>
                </GoldCard>

                {/* Address */}
                <GoldCard variant="default">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50">Wallet Address</span>
                    <button
                      onClick={() => copyToClipboard(currentWallet.publicKey, 'address')}
                      className="text-xs text-[#D4AF37] hover:text-[#FFD700] flex items-center gap-1"
                    >
                      {copiedField === 'address' ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <code className="block text-[#D4AF37] font-mono text-xs break-all">
                    {currentWallet.publicKey}
                  </code>
                </GoldCard>

                {/* Tabs */}
                <div className="flex gap-2 p-1 rounded-xl bg-[#0A0A0A]">
                  <button
                    onClick={() => setActiveTab("phrase")}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all",
                      activeTab === "phrase" 
                        ? "bg-gradient-to-b from-[#FFD700] to-[#D4AF37] text-black" 
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    📝 Phrase
                  </button>
                  <button
                    onClick={() => setActiveTab("key")}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all",
                      activeTab === "key" 
                        ? "bg-gradient-to-b from-[#FFD700] to-[#D4AF37] text-black" 
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    🔑 Key
                  </button>
                </div>

                {/* Content */}
                <AnimatePresence mode="wait">
                  {activeTab === "phrase" ? (
                    <motion.div
                      key="phrase"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <GoldCard variant="danger">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#FF8C00]">Recovery Phrase</span>
                          <button
                            onClick={() => copyToClipboard(currentWallet.mnemonic, 'mnemonic')}
                            className="text-xs text-[#FF8C00] hover:text-[#FFD700]"
                          >
                            {copiedField === 'mnemonic' ? '✓ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {currentWallet.mnemonic.split(" ").map((word, i) => (
                            <div key={i} className="flex items-center gap-1.5 p-2 rounded bg-[#000000]/50 border border-white/5">
                              <span className="text-[10px] text-white/30 w-4">{i + 1}.</span>
                              <span className="text-[#FFD700] font-medium text-sm">{word}</span>
                            </div>
                          ))}
                        </div>
                      </GoldCard>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="key"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <GoldCard variant="danger">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#FF3333]">Private Key</span>
                          <button
                            onClick={() => copyToClipboard(currentWallet.secretKey, 'secretKey')}
                            className="text-xs text-[#FF3333] hover:text-[#FF6666]"
                          >
                            {copiedField === 'secretKey' ? '✓ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                        <div className="p-3 rounded bg-[#000000]/50 border border-white/5">
                          <code className="text-[#FF6666] font-mono text-xs break-all">
                            {currentWallet.secretKey || "Use recovery phrase"}
                          </code>
                        </div>
                      </GoldCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Confirmation */}
                <label className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0A] border border-[#D4AF37]/20 cursor-pointer hover:border-[#D4AF37]/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="w-5 h-5 rounded border-[#D4AF37]/30 bg-[#000000] text-[#D4AF37] focus:ring-[#D4AF37]/50"
                  />
                  <span className="text-sm text-white/70">
                    I&apos;ve saved these keys (no recovery possible!)
                  </span>
                </label>

                {error && <p className="text-[#FF3333] text-sm">{error}</p>}

                <GoldButton
                  variant="primary"
                  className="w-full h-12"
                  onClick={handleBackupComplete}
                  disabled={!backupConfirmed}
                  glow
                >
                  {currentWalletIndex < generatedWallets.length - 1
                    ? `Next Wallet (${currentWalletIndex + 2}/${generatedWallets.length})`
                    : "🚀 Let's Go!"
                  }
                </GoldButton>
              </motion.div>
            )}

            {/* COMPLETE STEP */}
            {step === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.1 }}
                  className="inline-flex p-6 rounded-full bg-gradient-to-br from-[#00FF41]/20 to-[#D4AF37]/10 border border-[#00FF41]/30 shadow-[0_0_40px_rgba(0,255,65,0.3)]"
                >
                  <span className="text-6xl">🎯</span>
                </motion.div>
                
                <div>
                  <h2 className="text-3xl font-bold text-[#D4AF37] mb-3">
                    You&apos;re Ready!
                  </h2>
                  <p className="text-white/60 text-lg">
                    {generatedWallets.length > 1 
                      ? `${generatedWallets.length} wallets armed and ready`
                      : importedWallets.length > 0
                      ? `${importedWallets.filter(w => w.success).length}/${importedWallets.length} wallets imported`
                      : "Your sniper wallet is loaded"
                    }
                  </p>
                </div>

                {/* Import results */}
                {importedWallets.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2 text-left">
                    {importedWallets.map((wallet, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border",
                          wallet.success
                            ? "bg-[#00FF41]/5 border-[#00FF41]/30"
                            : "bg-[#FF3333]/5 border-[#FF3333]/30"
                        )}
                      >
                        <span className={wallet.success ? "text-[#00FF41]" : "text-[#FF3333]"}>
                          {wallet.success ? "✓" : "✗"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {wallet.label}
                          </p>
                          {wallet.success ? (
                            <p className="text-xs text-white/40 font-mono truncate">
                              {wallet.publicKey}
                            </p>
                          ) : (
                            <p className="text-xs text-[#FF3333]">
                              {wallet.error}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <GoldButton
                  variant="primary"
                  className="w-full max-w-sm mx-auto h-14 text-lg"
                  onClick={handleClose}
                  glow
                >
                  🎯 Start Sniping
                </GoldButton>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

