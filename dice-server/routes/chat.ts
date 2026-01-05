import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabase.js';
import rateLimit from 'express-rate-limit';

// Check if Supabase is available
if (!supabaseAdmin) {
  console.warn('[CHAT] Supabase not initialized. Chat routes will return errors.');
}

const router = Router();

// Rate limiting: 5 messages per minute per IP
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 messages per minute
  message: 'Too many messages. Please wait before sending another message.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Store rate limit per wallet address (in-memory, resets on server restart)
const walletRateLimit = new Map<string, { count: number; resetTime: number }>();

// Per-wallet rate limiting: 3 messages per 30 seconds
function checkWalletRateLimit(walletAddress: string): boolean {
  const now = Date.now();
  const limit = walletRateLimit.get(walletAddress);

  if (!limit || now > limit.resetTime) {
    walletRateLimit.set(walletAddress, { count: 1, resetTime: now + 30000 }); // 30 seconds
    return true;
  }

  if (limit.count >= 3) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * GET /api/chat/config
 * Get chat configuration (enabled/disabled)
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    // Check if chat is enabled in locked_data.json
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataPath = path.join(process.cwd(), 'data', 'locked_data.json');
    
    let chatEnabled = true; // Default to enabled
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const config = JSON.parse(data);
      chatEnabled = config.chatEnabled !== false; // Default to true if not set
    } catch (error) {
      // File doesn't exist or can't be read, use default
      console.log('[CHAT] Using default chat enabled: true');
    }

    res.json({
      enabled: chatEnabled,
      maxMessages: 50,
    });
  } catch (error: any) {
    console.error('[CHAT] Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch chat config' });
  }
});

/**
 * GET /api/chat/messages
 * Fetch recent chat messages (last 50)
 */
router.get('/messages', async (_req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Chat service unavailable. Supabase not configured.' });
    }

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[CHAT] Error fetching messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    // Reverse to show oldest first (for display)
    const messages = (data || []).reverse();

    res.json({
      success: true,
      messages,
    });
  } catch (error: any) {
    console.error('[CHAT] Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/send
 * Send a chat message
 */
router.post('/send', chatRateLimit, async (req: Request, res: Response) => {
  try {
    const { walletAddress, message } = req.body;

    if (!walletAddress || !message) {
      return res.status(400).json({ error: 'Wallet address and message are required' });
    }

    // Check if wallet is connected (basic validation)
    if (typeof walletAddress !== 'string' || walletAddress.length < 32) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Validate message
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (trimmedMessage.length > 500) {
      return res.status(400).json({ error: 'Message too long (max 500 characters)' });
    }

    // Check wallet-specific rate limit
    if (!checkWalletRateLimit(walletAddress)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait before sending another message.' });
    }

    // Check if chat is enabled
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataPath = path.join(process.cwd(), 'data', 'locked_data.json');
    
    let chatEnabled = true;
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const config = JSON.parse(data);
      chatEnabled = config.chatEnabled !== false;
    } catch (error) {
      // Use default
    }

    if (!chatEnabled) {
      return res.status(403).json({ error: 'Chat is currently disabled' });
    }

    // Insert message into Supabase
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Chat service unavailable. Supabase not configured.' });
    }

    const { data: newMessage, error: insertError } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        wallet_address: walletAddress,
        message: trimmedMessage,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CHAT] Error inserting message:', insertError);
      return res.status(500).json({ error: 'Failed to send message' });
    }

    // Clean up old messages (keep only last 50)
    if (newMessage?.id) {
      const { error: deleteError } = await supabaseAdmin
        .from('chat_messages')
        .delete()
        .lt('id', newMessage.id - 50);

      if (deleteError) {
        console.error('[CHAT] Error cleaning up old messages:', deleteError);
        // Non-critical, continue
      }
    }

    res.json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error('[CHAT] Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/chat/toggle
 * Toggle chat enabled/disabled (admin only)
 */
router.post('/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    // Update locked_data.json
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataPath = path.join(process.cwd(), 'data', 'locked_data.json');
    
    let config: any = {};
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      config = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, create new config
      config = { id: 1 };
    }

    config.chatEnabled = enabled;
    config.lastUpdated = new Date().toISOString();

    // Ensure data directory exists
    const dataDir = path.dirname(dataPath);
    await fs.mkdir(dataDir, { recursive: true });

    await fs.writeFile(dataPath, JSON.stringify(config, null, 2), 'utf-8');

    res.json({
      success: true,
      enabled,
    });
  } catch (error: any) {
    console.error('[CHAT] Error toggling chat:', error);
    res.status(500).json({ error: 'Failed to toggle chat' });
  }
});

export default router;

