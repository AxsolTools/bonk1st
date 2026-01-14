"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"
import { GoldCard } from "../ui/gold-card"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge } from "../ui/gold-badge"
import { GoldInput } from "../ui/gold-input"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { toast } from "sonner"

interface WalletWithBalance {
  id: string
  public_key: string
  label: string
  is_primary: boolean
  solBalance?: number
  isLoading?: boolean
}

type ManagerStep = "overview" | "generate" | "import" | "backup"

interface GeneratedWallet {
  publicKey: string
  secretKey: string
  mnemonic: string
  label: string
}

export function WalletManager1st() {
  const { 
    wallets, 
    activeWallet, 
    setActiveWallet, 
    refreshWallets, 
    userId,
    setUserId,
    showWalletManager,
    setShowWalletManager,
  } = useAuth()
  
  const [step, setStep] = React.useState<ManagerStep>("overview")
  const [walletsWithBalances, setWalletsWithBalances] = React.useState<WalletWithBalance[]>([])
  const [isLoadingBalances, setIsLoadingBalances] = React.useState(false)
  
  // Generation state
  const [walletCount, setWalletCount] = React.useState(1)
  const [walletLabel, setWalletLabel] = React.useState("")
  const [generatedWallets, setGeneratedWallets] = React.useState<GeneratedWallet[]>([])
  const [currentWalletIndex, setCurrentWalletIndex] = React.useState(0)
  
  // Import state
  const [importType, setImportType] = React.useState<"phrase" | "key">("phrase")
  const [importInput, setImportInput] = React.useState("")
  const [importLabel, setImportLabel] = React.useState("")
  
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [error, setError] = React.useState("")
  const [copiedField, setCopiedField] = React.useState<string | null>(null)
  
  const existingWalletCount = wallets?.length || 0
  const maxNewWallets = Math.min(5, 25 - existingWalletCount)

  // Auto-show generate step if no wallets exist
  React.useEffect(() => {
    if (showWalletManager && wallets && wallets.length === 0 && step === "overview") {
      // No wallets yet, stay on overview to show generate/import options
    }
  }, [showWalletManager, wallets, step])

  // Fetch balances for all wallets
  React.useEffect(() => {
    if (!showWalletManager || !wallets || wallets.length === 0) return
    
    const fetchBalances = async () => {
      setIsLoadingBalances(true)
      const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
      const connection = new Connection(rpcUrl, 'confirmed')
      
      const walletsWithBal: WalletWithBalance[] = await Promise.all(
        wallets.map(async (wallet) => {
          try {
            const pubkey = new PublicKey(wallet.public_key)
            const balance = await connection.getBalance(pubkey)
            return {
              ...wallet,
              solBalance: balance / LAMPORTS_PER_SOL,
              isLoading: false,
            }
          } catch (err) {
            console.error(`Failed to fetch balance for ${wallet.public_key}:`, err)
            return {
              ...wallet,
              solBalance: 0,
              isLoading: false,
            }
          }
        })
      )
      
      setWalletsWithBalances(walletsWithBal)
      setIsLoadingBalances(false)
    }
    
    fetchBalances()
  }, [showWalletManager, wallets])

  if (!showWalletManager) return null

  const handleClose = () => {
    setShowWalletManager(false)
    setStep("overview")
    setError("")
    setGeneratedWallets([])
    setImportInput("")
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopiedField(null), 2000)
  }

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
          body: JSON.stringify({ label, sessionId: userId }),
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
      toast.success(`Generated ${walletCount} wallet(s)!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate wallets")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportWallet = async () => {
    if (!importInput.trim()) {
      setError("Please enter your recovery phrase or private key")
      return
    }

    setIsProcessing(true)
    setError("")

    try {
      const response = await fetch("/api/wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: importType,
          value: importInput.trim(),
          sessionId: userId,
          label: importLabel || "Imported Wallet",
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to import wallet")

      await refreshWallets()
      setStep("overview")
      setImportInput("")
      setImportLabel("")
      toast.success("Wallet imported successfully!")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import wallet")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFinishBackup = async () => {
    await refreshWallets()
    setStep("overview")
    setGeneratedWallets([])
    toast.success("Wallets created successfully!")
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const totalBalance = walletsWithBalances.reduce((sum, w) => sum + (w.solBalance || 0), 0)

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <GoldCard variant="elevated" className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#D4AF37]">
                {step === "overview" ? "Wallet Manager" : 
                 step === "generate" ? "Generate Wallets" :
                 step === "import" ? "Import Wallet" :
                 "Backup Wallets"}
              </h2>
              <p className="text-xs text-white/50 mt-1">
                {step === "overview" ? `${existingWalletCount}/25 wallets • ${totalBalance.toFixed(4)} SOL total` :
                 step === "generate" ? "Create up to 5 new wallets at once" :
                 step === "import" ? "Import existing wallet from recovery phrase or private key" :
                 "Save your recovery phrases securely"}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* OVERVIEW */}
            {step === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                {/* Welcome message for first-time users */}
                {existingWalletCount === 0 && (
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-3">🎯</div>
                    <h3 className="text-xl font-bold text-[#FFD700] mb-2">wanna be first?</h3>
                    <p className="text-sm text-white/60">Create or import a wallet to start sniping</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <GoldButton
                    variant="primary"
                    onClick={() => setStep("generate")}
                    disabled={maxNewWallets === 0}
                    className="w-full"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate Wallet
                  </GoldButton>
                  <GoldButton
                    variant="ghost"
                    onClick={() => setStep("import")}
                    disabled={maxNewWallets === 0}
                    className="w-full"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Import Wallet
                  </GoldButton>
                </div>

                {/* Wallet List - only show if wallets exist */}
                {existingWalletCount > 0 && (
                <div className="space-y-2">
                  {walletsWithBalances.map((wallet) => (
                    <div
                      key={wallet.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        activeWallet?.id === wallet.id
                          ? "bg-[#D4AF37]/10 border-[#D4AF37]/30"
                          : "bg-[#0A0A0A] border-white/5 hover:border-white/20"
                      )}
                      onClick={() => setActiveWallet(wallet)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-white">{wallet.label}</span>
                            {wallet.is_primary && (
                              <GoldBadge variant="gold" size="xs">PRIMARY</GoldBadge>
                            )}
                            {activeWallet?.id === wallet.id && (
                              <GoldBadge variant="success" size="xs" dot>ACTIVE</GoldBadge>
                            )}
                          </div>
                          <p className="text-xs font-mono text-white/50">{truncateAddress(wallet.public_key)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#D4AF37]">
                            {wallet.isLoading ? "..." : `${(wallet.solBalance || 0).toFixed(4)} SOL`}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopy(wallet.public_key, wallet.id)
                            }}
                            className="text-xs text-white/30 hover:text-white/60 transition-colors"
                          >
                            {copiedField === wallet.id ? "Copied!" : "Copy Address"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </motion.div>
            )}

            {/* GENERATE */}
            {step === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <GoldInput
                  label="Wallet Label (Optional)"
                  placeholder="My Trading Wallet"
                  value={walletLabel}
                  onChange={(e) => setWalletLabel(e.target.value)}
                />

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Number of Wallets
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max={maxNewWallets}
                      value={walletCount}
                      onChange={(e) => setWalletCount(parseInt(e.target.value))}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                    />
                    <span className="text-lg font-bold text-[#D4AF37] w-8 text-center">
                      {walletCount}
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-1">
                    You can create up to {maxNewWallets} more wallet{maxNewWallets !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <GoldButton
                    variant="ghost"
                    onClick={() => setStep("overview")}
                    className="flex-1"
                  >
                    Back
                  </GoldButton>
                  <GoldButton
                    variant="primary"
                    onClick={handleGenerateWallets}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? "Generating..." : "Generate"}
                  </GoldButton>
                </div>
              </motion.div>
            )}

            {/* IMPORT */}
            {step === "import" && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <div className="flex gap-2 p-1 bg-white/5 rounded-lg mb-4">
                  <button
                    onClick={() => setImportType("phrase")}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                      importType === "phrase"
                        ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    Recovery Phrase
                  </button>
                  <button
                    onClick={() => setImportType("key")}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                      importType === "key"
                        ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    Private Key
                  </button>
                </div>

                <GoldInput
                  label="Wallet Label (Optional)"
                  placeholder="Imported Wallet"
                  value={importLabel}
                  onChange={(e) => setImportLabel(e.target.value)}
                />

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    {importType === "phrase" ? "Recovery Phrase" : "Private Key"}
                  </label>
                  <textarea
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder={importType === "phrase" ? "word1 word2 word3 ..." : "Your base58 private key"}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-[#D4AF37]/50 focus:outline-none resize-none font-mono text-sm"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <GoldButton
                    variant="ghost"
                    onClick={() => setStep("overview")}
                    className="flex-1"
                  >
                    Back
                  </GoldButton>
                  <GoldButton
                    variant="primary"
                    onClick={handleImportWallet}
                    disabled={isProcessing || !importInput.trim()}
                    className="flex-1"
                  >
                    {isProcessing ? "Importing..." : "Import"}
                  </GoldButton>
                </div>
              </motion.div>
            )}

            {/* BACKUP */}
            {step === "backup" && generatedWallets.length > 0 && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-400">Important: Save Your Recovery Phrases!</p>
                      <p className="text-xs text-amber-300/70 mt-1">
                        Write down these recovery phrases and store them securely. You'll need them to recover your wallets.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Wallet Navigation */}
                {generatedWallets.length > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setCurrentWalletIndex(Math.max(0, currentWalletIndex - 1))}
                      disabled={currentWalletIndex === 0}
                      className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-white/50">
                      Wallet {currentWalletIndex + 1} of {generatedWallets.length}
                    </span>
                    <button
                      onClick={() => setCurrentWalletIndex(Math.min(generatedWallets.length - 1, currentWalletIndex + 1))}
                      disabled={currentWalletIndex === generatedWallets.length - 1}
                      className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Current Wallet Info */}
                {generatedWallets[currentWalletIndex] && (
                  <div className="space-y-3">
                    <div className="p-4 bg-white/5 rounded-lg">
                      <p className="text-xs text-white/50 mb-1">Wallet Label</p>
                      <p className="text-sm font-semibold text-white">{generatedWallets[currentWalletIndex].label}</p>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-white/50">Public Address</p>
                        <button
                          onClick={() => handleCopy(generatedWallets[currentWalletIndex].publicKey, "pubkey")}
                          className="text-xs text-[#D4AF37] hover:text-[#FFD700] transition-colors"
                        >
                          {copiedField === "pubkey" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-sm font-mono text-white break-all">{generatedWallets[currentWalletIndex].publicKey}</p>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-white/50">Recovery Phrase</p>
                        <button
                          onClick={() => handleCopy(generatedWallets[currentWalletIndex].mnemonic, "mnemonic")}
                          className="text-xs text-[#D4AF37] hover:text-[#FFD700] transition-colors"
                        >
                          {copiedField === "mnemonic" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-sm font-mono text-white">{generatedWallets[currentWalletIndex].mnemonic}</p>
                    </div>
                  </div>
                )}

                <GoldButton
                  variant="primary"
                  onClick={handleFinishBackup}
                  className="w-full"
                >
                  {currentWalletIndex < generatedWallets.length - 1 ? "Next Wallet" : "Finish & Close"}
                </GoldButton>
              </motion.div>
            )}
          </AnimatePresence>
        </GoldCard>
      </motion.div>
    </div>
  )
}
