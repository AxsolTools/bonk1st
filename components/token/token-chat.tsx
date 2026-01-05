"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { Send, User, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/providers/auth-provider"

interface ChatMessage {
  id: string
  token_id: string
  wallet_address: string
  message: string
  created_at: string
  username?: string
}

interface TokenChatProps {
  tokenAddress: string
  tokenId?: string
}

export function TokenChat({ tokenAddress, tokenId }: TokenChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [resolvedTokenId, setResolvedTokenId] = useState<string | null>(tokenId || null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const { activeWallet, isAuthenticated } = useAuth()

  // Scroll to bottom within the chat container only (not the page)
  const scrollToBottom = (instant = false) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: instant ? "instant" : "smooth"
      })
    }
  }

  // Load initial messages and resolve token ID
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true)
      try {
        // First, resolve the token ID for real-time subscription
        const { data: tokenData } = await supabase
          .from('tokens')
          .select('id')
          .eq('mint_address', tokenAddress)
          .single()
        
        if (tokenData?.id) {
          setResolvedTokenId(tokenData.id)
        }

        // Then fetch messages
        const response = await fetch(`/api/token/${tokenAddress}/chat`)
        const data = await response.json()
        if (data.success) {
          // Messages come in descending order, reverse for display
          const msgs = (data.data.messages || []).reverse()
          setMessages(msgs)
        }
      } catch (error) {
        console.error("[CHAT] Failed to load messages:", error)
      }
      setIsLoading(false)
      // After initial load, scroll to bottom instantly (within container only)
      setTimeout(() => {
        scrollToBottom(true)
        setIsInitialLoad(false)
      }, 100)
    }

    loadMessages()
  }, [tokenAddress, supabase])

  // Subscribe to real-time updates (use token_id for filtering)
  useEffect(() => {
    if (!resolvedTokenId) return

    const channel = supabase
      .channel(`token-chat-${resolvedTokenId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "token_chat",
          filter: `token_id=eq.${resolvedTokenId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages((prev) => [...prev, newMsg])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [resolvedTokenId, supabase])

  // Scroll when new messages arrive (not on initial load to prevent page jump)
  useEffect(() => {
    if (!isInitialLoad && messages.length > 0) {
      scrollToBottom()
    }
  }, [messages, isInitialLoad])

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || !activeWallet || isSending) return

    setIsSending(true)
    try {
      const response = await fetch(`/api/token/${tokenAddress}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
          "x-session-id": activeWallet.session_id || "",
        },
        body: JSON.stringify({
          wallet_address: activeWallet.public_key,
          message: newMessage.trim(),
        }),
      })

      const data = await response.json()
      if (data.success) {
        setNewMessage("")
        // Message will be added via real-time subscription
      }
    } catch (error) {
      console.error("[CHAT] Failed to send message:", error)
    }
    setIsSending(false)
  }

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  // Truncate wallet address
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <div className="flex flex-col bg-black/30 rounded-xl border border-white/10 overflow-hidden">
      {/* Header - Compact */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium text-sm">Live Chat</h3>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <span className="text-[10px] text-white/40">{messages.length} msgs</span>
      </div>

      {/* Messages - More compact */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[280px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-2 ${
                  msg.wallet_address === activeWallet?.public_key
                    ? "flex-row-reverse"
                    : ""
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-3 h-3 text-white/60" />
                </div>
                <div
                  className={`flex-1 max-w-[85%] ${
                    msg.wallet_address === activeWallet?.public_key
                      ? "items-end"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {truncateAddress(msg.wallet_address)}
                    </span>
                    <span className="text-[10px] text-white/30">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div
                    className={`px-2.5 py-1.5 rounded-lg text-xs ${
                      msg.wallet_address === activeWallet?.public_key
                        ? "bg-cyan-500/20 text-white"
                        : "bg-white/5 text-white/80"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Compact */}
      <div className="p-2 border-t border-white/10">
        {isAuthenticated ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-1.5"
          >
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-8 text-xs"
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              className="bg-cyan-500 hover:bg-cyan-600 text-black px-3 h-8"
            >
              {isSending ? (
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
            </Button>
          </form>
        ) : (
          <div className="text-center text-white/50 text-xs py-1">
            Connect wallet to chat
          </div>
        )}
      </div>
    </div>
  )
}

