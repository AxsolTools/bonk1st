"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Wallet } from "@/lib/types/database"

interface WalletAuthContextType {
  isAuthenticated: boolean
  wallets: Wallet[]
  mainWallet: Wallet | null
  activeWallet: Wallet | null
  isLoading: boolean
  isOnboarding: boolean
  userId: string | null
  sessionId: string | null // Alias for userId (they are the same)
  
  // Multi-wallet trading
  toggledWallets: Set<string>          // Wallet IDs toggled for batch trading
  isMultiWalletMode: boolean           // Whether multi-wallet mode is enabled
  toggleWallet: (walletId: string) => void
  clearToggledWallets: () => void
  setMultiWalletMode: (enabled: boolean) => void
  getToggledWalletAddresses: () => string[]
  
  setIsOnboarding: (value: boolean) => void
  refreshWallets: () => Promise<void>
  setActiveWallet: (wallet: Wallet) => Promise<void>
  setMainWallet: (wallet: Wallet) => Promise<void>
  disconnect: () => void
  setUserId: (id: string) => void
}

const WalletAuthContext = createContext<WalletAuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [mainWallet, setMainWalletState] = useState<Wallet | null>(null)
  const [activeWallet, setActiveWalletState] = useState<Wallet | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [userId, setUserIdState] = useState<string | null>(null)
  
  // Multi-wallet trading state - persistent in localStorage
  const [toggledWallets, setToggledWallets] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('aqua_toggled_wallets')
      if (stored) {
        try {
          return new Set(JSON.parse(stored))
        } catch {
          return new Set()
        }
      }
    }
    return new Set()
  })
  const [isMultiWalletMode, setIsMultiWalletMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aqua_multi_wallet_mode') === 'true'
    }
    return false
  })

  const supabase = createClient()

  // Retrieve user ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("aqua_user_id")
    if (stored) {
      setUserIdState(stored)
    } else {
      setIsLoading(false)
    }
  }, [])

  const setUserId = (id: string) => {
    console.log('[AUTH] Setting userId/sessionId:', id)
    localStorage.setItem("aqua_user_id", id)
    setUserIdState(id)
  }

  const refreshWallets = useCallback(async () => {
    if (!userId) {
      console.log('[AUTH] No userId, skipping wallet refresh')
      setIsLoading(false)
      return
    }

    console.log('[AUTH] Refreshing wallets for session:', userId)

    try {
      // CRITICAL: Query by session_id, not user_id
      // The API stores wallets with session_id column
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("session_id", userId)
        .order("is_primary", { ascending: false })

      if (error) {
        console.error('[AUTH] Wallet query error:', error)
        throw error
      }

      console.log('[AUTH] Wallets found:', data?.length || 0)

      if (data && data.length > 0) {
        setWallets(data)
        const primary = data.find((w) => w.is_primary) || data[0]
        setMainWalletState(primary)
        
        // CRITICAL FIX: Preserve active wallet if it still exists, otherwise default to primary
        setActiveWalletState((currentActive) => {
          if (currentActive) {
            // Check if current active wallet still exists in the new data
            const stillExists = data.find((w) => w.id === currentActive.id)
            if (stillExists) {
              console.log('[AUTH] Preserved active wallet:', stillExists.public_key?.slice(0, 8))
              return stillExists // Return updated version of the wallet
            }
          }
          console.log('[AUTH] Set active wallet to primary:', primary.public_key?.slice(0, 8))
          return primary
        })
        
        console.log('[AUTH] Main wallet set:', primary.public_key?.slice(0, 8))
      } else {
        console.log('[AUTH] No wallets found for session')
        setWallets([])
        setMainWalletState(null)
        setActiveWalletState(null)
      }
    } catch (err) {
      console.error("[AUTH] Failed to fetch wallets:", err)
    } finally {
      setIsLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    if (userId) {
      refreshWallets()
    }
  }, [userId, refreshWallets])

  const setActiveWallet = async (wallet: Wallet) => {
    setActiveWalletState(wallet)
  }

  const setMainWallet = async (wallet: Wallet) => {
    if (!userId) return

    // Update previous main wallet
    if (mainWallet) {
      await supabase.from("wallets").update({ is_primary: false }).eq("id", mainWallet.id)
    }

    // Set new main wallet
    await supabase.from("wallets").update({ is_primary: true }).eq("id", wallet.id)

    setMainWalletState(wallet)
    await refreshWallets()
  }

  const disconnect = () => {
    localStorage.removeItem("aqua_user_id")
    setWallets([])
    setMainWalletState(null)
    setActiveWalletState(null)
    setUserIdState(null)
    setToggledWallets(new Set())
    setIsMultiWalletMode(false)
    window.location.reload()
  }

  // Multi-wallet trading functions - persist to localStorage
  const toggleWallet = useCallback((walletId: string) => {
    setToggledWallets((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(walletId)) {
        newSet.delete(walletId)
      } else {
        newSet.add(walletId)
      }
      // Persist to localStorage
      localStorage.setItem('aqua_toggled_wallets', JSON.stringify(Array.from(newSet)))
      console.log('[AUTH] Toggled wallets:', Array.from(newSet))
      return newSet
    })
  }, [])

  const clearToggledWallets = useCallback(() => {
    setToggledWallets(new Set())
    localStorage.removeItem('aqua_toggled_wallets')
    console.log('[AUTH] Cleared toggled wallets')
  }, [])

  const getToggledWalletAddresses = useCallback((): string[] => {
    return wallets
      .filter((w) => toggledWallets.has(w.id))
      .map((w) => w.public_key)
  }, [wallets, toggledWallets])

  // Persist multi-wallet mode to localStorage
  useEffect(() => {
    localStorage.setItem('aqua_multi_wallet_mode', isMultiWalletMode ? 'true' : 'false')
  }, [isMultiWalletMode])

  const isAuthenticated = wallets.length > 0 && mainWallet !== null
  
  // Debug log auth state
  useEffect(() => {
    console.log('[AUTH] State:', { 
      isAuthenticated, 
      walletsCount: wallets.length, 
      hasMainWallet: !!mainWallet,
      userId: userId?.slice(0, 8),
      isLoading,
      isMultiWalletMode,
      toggledWalletsCount: toggledWallets.size
    })
  }, [isAuthenticated, wallets.length, mainWallet, userId, isLoading, isMultiWalletMode, toggledWallets.size])

  return (
    <WalletAuthContext.Provider
      value={{
        isAuthenticated,
        wallets,
        mainWallet,
        activeWallet,
        isLoading,
        isOnboarding,
        userId,
        sessionId: userId, // Alias - sessionId and userId are the same
        
        // Multi-wallet trading
        toggledWallets,
        isMultiWalletMode,
        toggleWallet,
        clearToggledWallets,
        setMultiWalletMode: setIsMultiWalletMode,
        getToggledWalletAddresses,
        
        setIsOnboarding,
        refreshWallets,
        setActiveWallet,
        setMainWallet,
        disconnect,
        setUserId,
      }}
    >
      {children}
    </WalletAuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(WalletAuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
