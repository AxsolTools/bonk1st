"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { 
  Wallet, 
  Plus, 
  Upload, 
  ArrowLeft, 
  Copy, 
  Check, 
  AlertTriangle,
  Shield,
  X,
  Key,
  FileText,
  Sparkles,
  Minus,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"

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

export function WalletOnboarding() {
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
          ? (walletLabel || "Main Wallet")
          : `${walletLabel || "Wallet"} ${i + 1}`

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
    
    // Parse lines - each line is a private key
    const lines = importLines.trim().split('\n').filter(line => line.trim())
    
    if (lines.length === 0) {
      setError("Please enter at least one private key")
      setIsProcessing(false)
      return
    }

    if (lines.length > maxNewWallets) {
      setError(`Maximum ${maxNewWallets} wallets can be added (${existingWalletCount}/25 slots used)`)
      setIsProcessing(false)
      return
    }

    const results: ImportedWallet[] = []

    for (let i = 0; i < lines.length; i++) {
      const secretKey = lines[i].trim()
      const label = walletLabel 
        ? (lines.length === 1 ? walletLabel : `${walletLabel} ${i + 1}`)
        : `Imported Wallet ${i + 1}`

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
            error: data.error?.message || data.error || "Failed to import",
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
          error: err instanceof Error ? err.message : "Failed to import",
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
      setError("Please confirm you have saved your credentials")
      return
    }

    // If more wallets to show
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
      {/* Animated background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[var(--ocean-deep)]"
        onClick={handleClose}
      >
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--aqua-primary)]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--aqua-secondary)]/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Global Close Button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-[110] p-3 rounded-xl bg-[var(--ocean-surface)]/80 backdrop-blur-sm border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--ocean-surface)] transition-all shadow-lg"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
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
                    className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 border border-[var(--aqua-primary)]/20 mb-6"
                  >
                    <Wallet className="w-10 h-10 text-[var(--aqua-primary)]" />
                  </motion.div>
                  <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3">Get Started</h1>
                  <p className="text-[var(--text-muted)] text-lg">Your wallet = your account. Quick and secure.</p>
                  {existingWalletCount > 0 && (
                    <p className="text-sm text-[var(--text-dim)] mt-2">
                      {existingWalletCount}/25 wallet slots used
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
                    className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--aqua-primary)]/10 to-[var(--aqua-secondary)]/10 border border-[var(--aqua-primary)]/30 hover:border-[var(--aqua-primary)]/50 transition-all p-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--aqua-primary)]/5 to-[var(--aqua-secondary)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-[var(--aqua-primary)]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-7 h-7 text-[var(--aqua-primary)]" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">New Wallet(s)</h3>
                        <p className="text-[var(--text-muted)]">Generate up to {maxNewWallets} new wallets</p>
                      </div>
                      <Sparkles className="w-5 h-5 text-[var(--aqua-primary)]/50 group-hover:text-[var(--aqua-primary)] transition-colors" />
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setStep("import")}
                    disabled={maxNewWallets === 0}
                    className="w-full group relative overflow-hidden rounded-2xl bg-[var(--ocean-surface)]/50 border border-[var(--glass-border)] hover:border-[var(--text-muted)] transition-all p-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-[var(--ocean-surface)] flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6 text-[var(--text-secondary)]" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Import Wallet(s)</h3>
                        <p className="text-[var(--text-muted)]">Import multiple wallets at once</p>
                      </div>
                    </div>
                  </motion.button>
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center justify-center gap-2 text-[var(--text-muted)]"
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">Keys encrypted & stored securely</span>
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
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Generate New Wallets</h2>
                  <p className="text-[var(--text-muted)]">Create up to {maxNewWallets} new wallets at once</p>
                </div>

                <div className="space-y-5">
                  {/* Wallet Count Selector */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                      How many wallets?
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setWalletCount(Math.max(1, walletCount - 1))}
                        disabled={walletCount <= 1}
                        className="w-12 h-12 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--ocean-surface)]/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <div className="flex-1 h-12 rounded-xl bg-[var(--ocean-surface)]/50 border border-[var(--glass-border)] flex items-center justify-center">
                        <span className="text-2xl font-bold text-[var(--aqua-primary)]">{walletCount}</span>
                      </div>
                      <button
                        onClick={() => setWalletCount(Math.min(maxNewWallets, walletCount + 1))}
                        disabled={walletCount >= maxNewWallets}
                        className="w-12 h-12 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--ocean-surface)]/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex justify-center gap-2 mt-3">
                      {[1, 2, 3, 4, 5].slice(0, maxNewWallets).map((num) => (
                        <button
                          key={num}
                          onClick={() => setWalletCount(num)}
                          className={cn(
                            "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                            walletCount === num
                              ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                              : "bg-[var(--ocean-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                      Wallet Name Prefix {walletCount > 1 && <span className="text-[var(--text-dim)]">(will add numbers)</span>}
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder={walletCount === 1 ? "Main Wallet" : "Trading Wallet"}
                      className="h-14 text-lg bg-[var(--ocean-surface)]/50 border-[var(--glass-border)]"
                    />
                    {walletCount > 1 && (
                      <p className="text-xs text-[var(--text-dim)] mt-2">
                        Example: &quot;{walletLabel || "Wallet"} 1&quot;, &quot;{walletLabel || "Wallet"} 2&quot;, etc.
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="p-4 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-[var(--error)] shrink-0 mt-0.5" />
                      <p className="text-[var(--error)]">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleGenerateWallets}
                    disabled={isProcessing}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] font-semibold text-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating {walletCount} wallet{walletCount > 1 ? 's' : ''}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate {walletCount} Wallet{walletCount > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
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
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Import Wallets</h2>
                  <p className="text-[var(--text-muted)]">Enter one private key per line (max {maxNewWallets})</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                      Wallet Name Prefix
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder="Imported Wallet"
                      className="h-12 bg-[var(--ocean-surface)]/50 border-[var(--glass-border)]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-[var(--text-secondary)]">
                        Private Keys (one per line)
                      </label>
                      <span className="text-xs text-[var(--text-dim)]">
                        {importLines.trim().split('\n').filter(l => l.trim()).length} / {maxNewWallets} wallets
                      </span>
                    </div>
                    <Textarea
                      value={importLines}
                      onChange={(e) => setImportLines(e.target.value)}
                      placeholder={`Paste private keys here, one per line...\n\nExample:\n5abc...xyz\n4def...uvw\n3ghi...rst`}
                      rows={8}
                      className="bg-[var(--ocean-surface)]/50 border-[var(--glass-border)] resize-none font-mono text-sm"
                    />
                    <p className="text-xs text-[var(--text-dim)] mt-2">
                      Supports base58 private keys or seed phrases
                    </p>
                  </div>

                  {error && (
                    <div className="p-4 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-[var(--error)] shrink-0 mt-0.5" />
                      <p className="text-[var(--error)]">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleImportWallets}
                    disabled={isProcessing || !importLines.trim()}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] font-semibold text-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Importing wallets...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Import Wallet{importLines.trim().split('\n').filter(l => l.trim()).length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
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
                {/* Progress indicator for multiple wallets */}
                {generatedWallets.length > 1 && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {generatedWallets.map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-3 h-3 rounded-full transition-all",
                          idx < currentWalletIndex
                            ? "bg-[var(--success)]"
                            : idx === currentWalletIndex
                            ? "bg-[var(--aqua-primary)] scale-125"
                            : "bg-[var(--glass-border)]"
                        )}
                      />
                    ))}
                  </div>
                )}

                {/* Warning header */}
                <div className="text-center p-5 rounded-2xl bg-gradient-to-r from-[var(--warm-orange)]/10 to-[var(--warm-pink)]/10 border border-[var(--warm-orange)]/20">
                  <AlertTriangle className="w-10 h-10 text-[var(--warm-orange)] mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                    {generatedWallets.length > 1 
                      ? `Backup Wallet ${currentWalletIndex + 1} of ${generatedWallets.length}`
                      : "Secure Your Wallet"
                    }
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {currentWallet.label}
                  </p>
                </div>

                {/* Wallet Address */}
                <div className="p-4 rounded-xl bg-[var(--ocean-surface)]/30 border border-[var(--glass-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Wallet Address</span>
                    <button
                      onClick={() => copyToClipboard(currentWallet.publicKey, 'address')}
                      className="text-xs text-[var(--aqua-primary)] hover:opacity-80 flex items-center gap-1"
                    >
                      {copiedField === 'address' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedField === 'address' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <code className="block text-[var(--aqua-primary)] font-mono text-xs break-all">
                    {currentWallet.publicKey}
                  </code>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-1 rounded-xl bg-[var(--ocean-surface)]/50">
                  <button
                    onClick={() => setActiveTab("phrase")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all text-sm",
                      activeTab === "phrase" 
                        ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]" 
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    Phrase
                  </button>
                  <button
                    onClick={() => setActiveTab("key")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all text-sm",
                      activeTab === "key" 
                        ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]" 
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Key className="w-4 h-4" />
                    Key
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
                      className="p-4 rounded-xl bg-gradient-to-br from-[var(--warm-orange)]/5 to-[var(--warm-pink)]/5 border border-[var(--warm-orange)]/20"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-[var(--warm-orange)]">Recovery Phrase</span>
                        <button
                          onClick={() => copyToClipboard(currentWallet.mnemonic, 'mnemonic')}
                          className="text-xs text-[var(--warm-orange)] hover:opacity-80 flex items-center gap-1"
                        >
                          {copiedField === 'mnemonic' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedField === 'mnemonic' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {currentWallet.mnemonic.split(" ").map((word, i) => (
                          <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-[var(--ocean-deep)]/50 border border-[var(--glass-border)]">
                            <span className="text-[10px] text-[var(--text-muted)] w-4">{i + 1}.</span>
                            <span className="text-[var(--warm-orange)] font-medium text-sm">{word}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="key"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 rounded-xl bg-gradient-to-br from-[var(--warm-pink)]/5 to-[var(--error)]/5 border border-[var(--warm-pink)]/20"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-[var(--warm-pink)]">Private Key</span>
                        <button
                          onClick={() => copyToClipboard(currentWallet.secretKey, 'secretKey')}
                          className="text-xs text-[var(--warm-pink)] hover:opacity-80 flex items-center gap-1"
                        >
                          {copiedField === 'secretKey' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedField === 'secretKey' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--ocean-deep)]/50 border border-[var(--glass-border)]">
                        <code className="text-[var(--warm-pink)] font-mono text-xs break-all leading-relaxed">
                          {currentWallet.secretKey || "Use recovery phrase"}
                        </code>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Confirmation */}
                <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--ocean-surface)]/30 border border-[var(--glass-border)] cursor-pointer hover:bg-[var(--ocean-surface)]/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="w-5 h-5 rounded border-[var(--glass-border)] bg-[var(--ocean-surface)] text-[var(--aqua-primary)]"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">
                    I have saved this wallet&apos;s credentials
                  </span>
                </label>

                {error && <p className="text-[var(--error)] text-sm">{error}</p>}

                <button
                  onClick={handleBackupComplete}
                  disabled={!backupConfirmed}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentWalletIndex < generatedWallets.length - 1
                    ? `Next Wallet (${currentWalletIndex + 2}/${generatedWallets.length})`
                    : "Continue to Dashboard"
                  }
                </button>
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
                  className="inline-flex p-6 rounded-full bg-gradient-to-br from-[var(--success)]/20 to-[var(--aqua-secondary)]/10 border border-[var(--success)]/20"
                >
                  <Check className="w-16 h-16 text-[var(--success)]" />
                </motion.div>
                
                <div>
                  <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
                    {importedWallets.length > 0 ? "Import Complete!" : "You're All Set!"}
                  </h2>
                  <p className="text-[var(--text-muted)] text-lg">
                    {generatedWallets.length > 1 
                      ? `${generatedWallets.length} wallets created successfully`
                      : importedWallets.length > 0
                      ? `${importedWallets.filter(w => w.success).length} of ${importedWallets.length} wallets imported`
                      : "Your wallet is ready. Welcome to Propel."
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
                            ? "bg-[var(--success)]/5 border-[var(--success)]/20"
                            : "bg-[var(--error)]/5 border-[var(--error)]/20"
                        )}
                      >
                        {wallet.success ? (
                          <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-[var(--error)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {wallet.label}
                          </p>
                          {wallet.success ? (
                            <p className="text-xs text-[var(--text-muted)] font-mono truncate">
                              {wallet.publicKey}
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--error)]">
                              {wallet.error}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={handleClose}
                  className="w-full max-w-sm mx-auto h-14 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] font-semibold text-lg hover:opacity-90 transition-all"
                >
                  Start Exploring
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
