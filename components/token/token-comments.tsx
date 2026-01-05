"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Heart, User, Clock, Reply, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/providers/auth-provider"

interface Comment {
  id: string
  token_id: string
  wallet_address: string
  content: string
  parent_id: string | null
  likes_count: number
  created_at: string
  updated_at: string
  replies?: Comment[]
  userLiked?: boolean
}

interface TokenCommentsProps {
  tokenAddress: string
  tokenId?: string
}

export function TokenComments({ tokenAddress, tokenId }: TokenCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [resolvedTokenId, setResolvedTokenId] = useState<string | null>(tokenId || null)
  const supabase = createClient()
  const { activeWallet, isAuthenticated } = useAuth()

  // Load comments and resolve token ID
  useEffect(() => {
    const loadComments = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/token/${tokenAddress}/comments`)
        const data = await response.json()
        if (data.success) {
          // Organize comments into threads
          const allComments = data.data.comments || []
          const parentComments = allComments.filter((c: Comment) => !c.parent_id)
          const childComments = allComments.filter((c: Comment) => c.parent_id)

          // Attach replies to parents
          const threaded = parentComments.map((parent: Comment) => ({
            ...parent,
            replies: childComments.filter((c: Comment) => c.parent_id === parent.id),
          }))

          setComments(threaded)
          
          // Store token_id from first comment for subscription
          if (allComments.length > 0 && allComments[0].token_id) {
            setResolvedTokenId(allComments[0].token_id)
          }
        }
      } catch (error) {
        console.error("[COMMENTS] Failed to load:", error)
      }
      setIsLoading(false)
    }

    loadComments()
  }, [tokenAddress])

  // Subscribe to real-time updates (use token_id for filtering)
  useEffect(() => {
    if (!resolvedTokenId) return

    const loadComments = async () => {
      try {
        const response = await fetch(`/api/token/${tokenAddress}/comments`)
        const data = await response.json()
        if (data.success) {
          const allComments = data.data.comments || []
          const parentComments = allComments.filter((c: Comment) => !c.parent_id)
          const childComments = allComments.filter((c: Comment) => c.parent_id)
          const threaded = parentComments.map((parent: Comment) => ({
            ...parent,
            replies: childComments.filter((c: Comment) => c.parent_id === parent.id),
          }))
          setComments(threaded)
        }
      } catch (error) {
        console.error("[COMMENTS] Realtime reload failed:", error)
      }
    }

    const channel = supabase
      .channel(`token-comments-${resolvedTokenId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "token_comments",
          filter: `token_id=eq.${resolvedTokenId}`,
        },
        () => {
          // Reload comments on any change
          loadComments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [resolvedTokenId, tokenAddress, supabase])

  // Post comment
  const handlePostComment = async (parentId?: string) => {
    const content = parentId ? replyContent : newComment
    if (!content.trim() || !activeWallet || isSending) return

    setIsSending(true)
    try {
      const response = await fetch(`/api/token/${tokenAddress}/comments`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
          "x-session-id": activeWallet.session_id || "",
        },
        body: JSON.stringify({
          wallet_address: activeWallet.public_key,
          content: content.trim(),
          parentId: parentId || null,
        }),
      })

      const data = await response.json()
      if (data.success) {
        if (parentId) {
          setReplyContent("")
          setReplyTo(null)
        } else {
          setNewComment("")
        }
        // Comments will be updated via real-time subscription
      }
    } catch (error) {
      console.error("[COMMENTS] Failed to post:", error)
    }
    setIsSending(false)
  }

  // Like comment
  const handleLike = async (commentId: string) => {
    if (!activeWallet) return

    try {
      await fetch(`/api/token/${tokenAddress}/comments/${commentId}/like`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
          "x-session-id": activeWallet.session_id || "",
        },
        body: JSON.stringify({
          wallet_address: activeWallet.public_key,
        }),
      })
      // Likes will be updated via real-time subscription
    } catch (error) {
      console.error("[COMMENTS] Failed to like:", error)
    }
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

  // Comment component
  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${isReply ? "ml-12 mt-3" : ""}`}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-white/60" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-cyan-400 font-mono">
              {truncateAddress(comment.wallet_address)}
            </span>
            <span className="text-xs text-white/30 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(comment.created_at)}
            </span>
          </div>
          <p className="text-white/80 text-sm leading-relaxed mb-2">
            {comment.content}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleLike(comment.id)}
              className="flex items-center gap-1 text-white/40 hover:text-pink-400 transition-colors text-xs"
            >
              <Heart
                className={`w-4 h-4 ${comment.userLiked ? "fill-pink-400 text-pink-400" : ""}`}
              />
              {comment.likes_count || 0}
            </button>
            {!isReply && (
              <button
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="flex items-center gap-1 text-white/40 hover:text-cyan-400 transition-colors text-xs"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
            )}
          </div>

          {/* Reply input */}
          {replyTo === comment.id && (
            <div className="mt-3 flex gap-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                maxLength={1000}
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[60px] text-sm"
              />
              <Button
                onClick={() => handlePostComment(comment.id)}
                disabled={!replyContent.trim() || isSending}
                className="bg-cyan-500 hover:bg-cyan-600 text-black self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-3 space-y-3">
              {comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )

  return (
    <div className="bg-black/30 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-cyan-400" />
        <h3 className="text-white font-medium">Comments</h3>
        <span className="text-xs text-white/40">({comments.length})</span>
      </div>

      {/* New comment input */}
      {isAuthenticated ? (
        <div className="p-4 border-b border-white/10">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={1000}
            className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[80px] mb-2"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/30">{newComment.length}/1000</span>
            <Button
              onClick={() => handlePostComment()}
              disabled={!newComment.trim() || isSending}
              className="bg-cyan-500 hover:bg-cyan-600 text-black"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
              ) : (
                <MessageSquare className="w-4 h-4 mr-2" />
              )}
              Post Comment
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-white/10 text-center text-white/50 text-sm">
          Connect wallet to comment
        </div>
      )}

      {/* Comments list */}
      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-white/40 py-8">
            No comments yet. Be the first to share your thoughts!
          </div>
        ) : (
          <AnimatePresence>
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

