"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { GlassPanel, StepIndicator } from "@/components/ui/glass-panel"
import { JupiterStepBasics } from "@/components/launch-jupiter/jupiter-step-basics"
import { StepAquaSettings } from "@/components/launch/step-aqua-settings"
import { StepBundle } from "@/components/launch/step-bundle"
import { JupiterReview } from "@/components/launch-jupiter/jupiter-review"
import { JupiterPreview } from "@/components/launch-jupiter/jupiter-preview"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"

export interface BundleWalletConfig {
  walletId: string
  address: string
  label: string
  buyAmount: number
  balance: number
  selected: boolean
}

export interface JupiterFormData {
  name: string
  symbol: string
  description: string
  imageFile: File | null
  imagePreview: string | null
  website: string
  twitter: string
  telegram: string
  discord: string
  totalSupply: string
  initialBuySol: string
  
  // Pour Rate (Liquidity Engine)
  pourEnabled: boolean
  pourRate: number
  pourInterval: 'hourly' | 'daily'
  pourSource: 'fees' | 'treasury' | 'both'
  
  // Evaporation (Burn Mechanics)
  evaporationEnabled: boolean
  evaporationRate: number
  
  // Fee Distribution
  feeToLiquidity: number
  feeToCreator: number
  
  // Auto-Harvest (Tide Harvest)
  autoClaimEnabled: boolean
  claimThreshold: number
  claimInterval: 'hourly' | 'daily' | 'weekly'
  
  // Bundle Launch Options
  launchWithBundle: boolean
  bundleWallets: BundleWalletConfig[]
  
  // Jupiter-specific
  migrationTarget: 'raydium' | 'meteora'
  migrationThreshold: number
}

const initialFormData: JupiterFormData = {
  name: "",
  symbol: "",
  description: "",
  imageFile: null,
  imagePreview: null,
  website: "",
  twitter: "",
  telegram: "",
  discord: "",
  totalSupply: "1000000000",
  initialBuySol: "0",
  
  // Pour Rate defaults
  pourEnabled: true,
  pourRate: 2,
  pourInterval: 'hourly',
  pourSource: 'fees',
  
  // Evaporation defaults
  evaporationEnabled: false,
  evaporationRate: 1,
  
  // Fee Distribution defaults (must total 100)
  feeToLiquidity: 25,
  feeToCreator: 75,
  
  // Auto-Harvest defaults
  autoClaimEnabled: true,
  claimThreshold: 0.1,
  claimInterval: 'daily',
  
  // Bundle defaults
  launchWithBundle: false,
  bundleWallets: [],
  
  // Jupiter-specific defaults
  migrationTarget: 'raydium',
  migrationThreshold: 85,
}

const steps = [
  { id: 1, name: "Basics", description: "Token identity" },
  { id: 2, name: "Liquidity", description: "AQUA settings" },
  { id: 3, name: "Bundle", description: "Launch options" },
  { id: 4, name: "Review", description: "Deploy token" },
]

interface JupiterWizardProps {
  creatorWallet: string
}

export function JupiterWizard({ creatorWallet }: JupiterWizardProps) {
  const router = useRouter()
  const { userId, sessionId } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<JupiterFormData>(initialFormData)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  
  // Pre-generated mint keypair for showing address before confirmation
  const [mintKeypair, setMintKeypair] = useState<Keypair | null>(null)
  const [mintAddress, setMintAddress] = useState<string | null>(null)

  // Generate mint keypair when entering Review step
  const generateMintKeypair = useCallback(() => {
    const keypair = Keypair.generate()
    setMintKeypair(keypair)
    setMintAddress(keypair.publicKey.toBase58())
    console.log('[JUPITER] Pre-generated mint address:', keypair.publicKey.toBase58())
  }, [])

  const regenerateMint = useCallback(() => {
    generateMintKeypair()
  }, [generateMintKeypair])

  const updateFormData = (updates: Partial<JupiterFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const nextStep = () => {
    if (currentStep < 4) {
      const newStep = currentStep + 1
      setCurrentStep(newStep)
      // Generate mint keypair when entering review step
      if (newStep === 4 && !mintKeypair) {
        generateMintKeypair()
      }
    }
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handleDeploy = async () => {
    setIsDeploying(true)
    setDeployError(null)

    console.log('[JUPITER] Deploying token...', { 
      sessionId: sessionId?.slice(0, 8), 
      wallet: creatorWallet?.slice(0, 8),
      mintAddress: mintAddress?.slice(0, 8),
      launchWithBundle: formData.launchWithBundle,
      bundleWalletsCount: formData.bundleWallets.length
    })

    try {
      // Ensure we have a mint keypair
      let currentMintKeypair = mintKeypair
      if (!currentMintKeypair) {
        currentMintKeypair = Keypair.generate()
        setMintKeypair(currentMintKeypair)
        setMintAddress(currentMintKeypair.publicKey.toBase58())
      }

      // Encode the mint secret key to send to backend
      const mintSecretKey = bs58.encode(currentMintKeypair.secretKey)

      // Prepare bundle wallets if enabled
      const bundleConfig = formData.launchWithBundle && formData.bundleWallets.length > 0
        ? {
            bundleWallets: formData.bundleWallets.map(w => ({
              walletId: w.walletId,
              address: w.address,
              buyAmountSol: w.buyAmount,
            }))
          }
        : {}

      // Choose API endpoint based on bundle option
      const apiEndpoint = formData.launchWithBundle && formData.bundleWallets.length > 0
        ? "/api/jupiter/create-bundle"
        : "/api/jupiter/create"

      // CRITICAL: Include auth headers for API authentication
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress: creatorWallet,
        }),
        body: JSON.stringify({
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          image: formData.imagePreview,
          website: formData.website,
          twitter: formData.twitter,
          telegram: formData.telegram,
          discord: formData.discord,
          totalSupply: parseInt(formData.totalSupply),
          decimals: 9, // Jupiter tokens use 9 decimals
          initialBuySol: parseFloat(formData.initialBuySol) || 0,
          
          // AQUA Parameters
          pourEnabled: formData.pourEnabled,
          pourRate: formData.pourRate,
          pourInterval: formData.pourInterval,
          pourSource: formData.pourSource,
          
          evaporationEnabled: formData.evaporationEnabled,
          evaporationRate: formData.evaporationRate,
          
          feeToLiquidity: formData.feeToLiquidity,
          feeToCreator: formData.feeToCreator,
          
          autoClaimEnabled: formData.autoClaimEnabled,
          claimThreshold: formData.claimThreshold,
          claimInterval: formData.claimInterval,
          
          // Jupiter-specific
          migrationTarget: formData.migrationTarget,
          migrationThreshold: formData.migrationThreshold,
          
          // Send pre-generated mint keypair so backend uses the same address
          mintSecretKey: mintSecretKey,
          mintAddress: currentMintKeypair.publicKey.toBase58(),
          
          // Bundle configuration
          ...bundleConfig,
        }),
      })

      const data = await response.json()
      console.log('[JUPITER] Response:', data)

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || "Failed to create token")
      }

      // Use the pre-generated mint address (or fallback to response)
      const finalMintAddress = data.data?.mintAddress || data.mintAddress || currentMintKeypair.publicKey.toBase58()
      
      if (!finalMintAddress) {
        throw new Error("Token created but mint address not returned")
      }

      console.log('[JUPITER] Token created successfully:', {
        mintAddress: finalMintAddress,
        tokenId: data.data?.tokenId,
        txSignature: data.data?.txSignature,
        dbcPoolAddress: data.data?.dbcPoolAddress
      })
      
      // Small delay to ensure database is updated and propagated
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Redirect to token page
      router.replace(`/token/${finalMintAddress}`)
    } catch (err) {
      console.error('[JUPITER] Error:', err)
      setDeployError(err instanceof Error ? err.message : "Deployment failed")
      setIsDeploying(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Progress Steps - Glass Style */}
        <GlassPanel className="rounded-2xl">
          <StepIndicator steps={steps} currentStep={currentStep} />
        </GlassPanel>

        {/* Step Content */}
        <GlassPanel 
          title={`Step ${currentStep}: ${steps[currentStep - 1].name}`}
          subtitle={steps[currentStep - 1].description}
          className="rounded-2xl"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 1 && (
                <JupiterStepBasics 
                  formData={formData} 
                  updateFormData={updateFormData} 
                  onNext={nextStep} 
                  creatorWallet={creatorWallet}
                />
              )}
              {currentStep === 2 && (
                <StepAquaSettings
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <StepBundle
                    launchWithBundle={formData.launchWithBundle}
                    bundleWallets={formData.bundleWallets}
                    onToggleBundle={(enabled) => updateFormData({ launchWithBundle: enabled })}
                    onUpdateWallets={(wallets) => updateFormData({ bundleWallets: wallets })}
                    initialBuySol={parseFloat(formData.initialBuySol) || 0}
                  />
                  
                  {/* Navigation */}
                  <div className="flex justify-between pt-4 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={prevStep}
                      className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={nextStep}
                      className="px-6 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm font-semibold hover:from-orange-600 hover:to-yellow-600 transition-all shadow-lg shadow-orange-500/25"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}
              {currentStep === 4 && (
                <JupiterReview
                  formData={formData}
                  onBack={prevStep}
                  onDeploy={handleDeploy}
                  isDeploying={isDeploying}
                  error={deployError}
                  mintAddress={mintAddress}
                  onRegenerateMint={regenerateMint}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </GlassPanel>
      </div>

      {/* Live Preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-28">
          <JupiterPreview formData={formData} />
        </div>
      </div>
    </div>
  )
}

