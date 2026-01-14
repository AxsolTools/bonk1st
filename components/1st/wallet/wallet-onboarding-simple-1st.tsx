"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { GoldButton } from "../ui/gold-button"
import Image from "next/image"

export function WalletOnboardingSimple1st() {
  const { isOnboarding, setIsOnboarding, setShowWalletManager, wallets } = useAuth()
  
  if (!isOnboarding) return null

  const existingWalletCount = wallets?.length || 0

  const handleClose = () => {
    setIsOnboarding(false)
  }

  const handleGenerate = () => {
    setIsOnboarding(false)
    setShowWalletManager(true)
  }

  const handleImport = () => {
    setIsOnboarding(false)
    setShowWalletManager(true)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md"
        >
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="inline-flex p-5 rounded-3xl bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/10 border-2 border-[#D4AF37]/40 mb-6 shadow-[0_0_60px_rgba(212,175,55,0.4)]"
            >
              <Image
                src="/1st-logo.png"
                alt="BONK1ST"
                width={64}
                height={64}
                className="object-contain"
              />
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-black text-[#D4AF37] mb-3 tracking-tight"
            >
              BONK1ST
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl text-white/80 font-bold mb-2"
            >
              wanna be first?
            </motion.p>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-white/40"
            >
              Connect your wallet to start sniping
            </motion.p>
            
            {existingWalletCount > 0 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xs text-white/30 mt-2"
              >
                {existingWalletCount}/25 wallets loaded
              </motion.p>
            )}
          </div>

          {/* Action Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <button
              onClick={handleGenerate}
              className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/10 border-2 border-[#D4AF37]/40 hover:border-[#D4AF37]/80 hover:shadow-[0_0_40px_rgba(212,175,55,0.3)] transition-all duration-300 p-6"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#D4AF37]/0 via-[#FFD700]/10 to-[#D4AF37]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#FFD700]/30 to-[#D4AF37]/20 flex items-center justify-center border border-[#D4AF37]/30 group-hover:scale-110 transition-transform">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-lg font-bold text-white mb-0.5">Generate Wallet</h3>
                  <p className="text-sm text-white/60">Create up to 5 fresh wallets</p>
                </div>
                <span className="text-2xl">🎯</span>
              </div>
            </button>

            <button
              onClick={handleImport}
              className="w-full group relative overflow-hidden rounded-2xl bg-[#0A0A0A]/80 border-2 border-white/10 hover:border-[#D4AF37]/40 hover:bg-[#0A0A0A] transition-all duration-300 p-6"
            >
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 group-hover:border-[#D4AF37]/20 transition-all">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="opacity-60">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-lg font-bold text-white mb-0.5">Import Wallet</h3>
                  <p className="text-sm text-white/60">Use existing private key</p>
                </div>
                <span className="text-2xl opacity-60">📥</span>
              </div>
            </button>
          </motion.div>

          {/* Security Note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-6 flex items-center justify-center gap-2 text-white/30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-xs">Keys encrypted locally • Never shared</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
