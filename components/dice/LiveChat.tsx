"use client"

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSolanaWallet } from './SolanaWalletContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface ChatMessage {
  id: number;
  wallet_address: string;
  message: string;
  created_at: string;
}

const LiveChat = () => {
  const { publicKey, isConnected } = useSolanaWallet();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat config
  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/config');
      const config = await response.json();
      setChatEnabled(config.enabled);
    } catch (error) {
      console.error('Error fetching chat config:', error);
    }
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!chatEnabled) return;
    try {
      const response = await fetch('/api/chat/messages');
      const data = await response.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [chatEnabled]);

  // Initial config fetch
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Poll for messages
  useEffect(() => {
    if (!chatEnabled) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [chatEnabled, fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !isConnected || !chatEnabled || !publicKey) return;

    setIsSending(true);
    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey,
          message: trimmed,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      setMessage('');
      fetchMessages();
    } catch (error: any) {
      toast.error('Failed to send message', {
        description: error.message,
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatAddressShort = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (!chatEnabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-12"
      >
        <Card className="overflow-hidden bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center text-cyan-400">
              <MessageCircle className="mr-2 h-5 w-5" />
              Live Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              Chat is currently disabled
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-12"
    >
      <motion.h2
        className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <MessageCircle className="inline-block mr-2 mb-1" /> Live Chat
        <span className="ml-2 inline-flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
      </motion.h2>

      <Card className="overflow-hidden bg-zinc-900/80 border-zinc-800">
        <CardContent className="p-0 flex flex-col" style={{ height: '400px' }}>
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No messages yet. Be the first to chat!
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isOwnMessage = msg.wallet_address === publicKey;
                  const isNew = index === messages.length - 1;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={isNew ? { opacity: 0, x: -20 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 ${
                          isOwnMessage
                            ? 'bg-cyan-500/20 border border-cyan-500/30'
                            : 'bg-zinc-800/50 border border-zinc-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-cyan-400">
                            {isOwnMessage ? 'You' : formatAddressShort(msg.wallet_address)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-200 break-words">{msg.message}</p>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          {isConnected ? (
            <form onSubmit={handleSend} className="border-t border-zinc-800 p-4">
              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={500}
                  disabled={isSending || !chatEnabled}
                  className="bg-zinc-950/50 border-zinc-700 text-white placeholder:text-gray-500"
                />
                <Button
                  type="submit"
                  disabled={!message.trim() || isSending || !chatEnabled}
                  className="bg-cyan-500 hover:bg-cyan-600 text-black"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {message.length}/500 characters
                {!chatEnabled && ' • Chat is disabled'}
              </p>
            </form>
          ) : (
            <div className="border-t border-zinc-800 p-4 text-center text-gray-500">
              Connect your wallet to chat
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LiveChat;

