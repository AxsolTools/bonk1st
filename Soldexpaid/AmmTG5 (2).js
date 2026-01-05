import TelegramBot from 'node-telegram-bot-api';
import WebSocket from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import toml from 'toml';
import DexScreenerTracker from './DexScreenerTracker.js';
import { promises as dns } from 'dns';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Client } from 'xrpl';
import fetch from 'node-fetch'; // Required for TOML fetching

// Replace with your BotFather token
const TELEGRAM_TOKEN = '7745383794:AAH2of3-OjrwdU3fZdWRyhAhZbRI6fxtC_k';
// Add admin IDs who can manage whitelist (replace with your actual Telegram ID)
const ADMIN_IDS = [5736060219];
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: {
        autoStart: false,
        params: {
            timeout: 10
        },
        interval: 2000
    }
});

// Add better error handling for polling errors
bot.on('polling_error', async (error) => {
    console.log('Polling error:', error.code);
    
    if (error.code === 'ETELEGRAM' && error.response?.body?.error_code === 409) {
        await handlePollingConflict();
        return;
    }
    
    if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
        console.log('Fatal polling error, attempting recovery...');
        
        try {
            // Stop current polling
            await bot.stopPolling();
            
            // Wait a bit before trying to restart
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Try to restart polling
            await bot.startPolling();
            console.log('Bot polling restarted successfully');
        } catch (restartError) {
            console.error('Error during polling restart:', restartError);
            
            // If restart fails, try again with increasing delay
            setTimeout(() => {
                bot.startPolling()
                    .then(() => console.log('Bot reconnected successfully'))
                    .catch(console.error);
            }, 10000);
        }
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'EAI_AGAIN') {
        console.log('Network connection issue detected, starting network check...');
        startNetworkCheck();
    }
});

// Add a periodic connection check
setInterval(async () => {
    try {
        await bot.getMe();
    } catch (error) {
        console.log('Connection check failed, attempting to restart polling...');
        bot.stopPolling()
            .then(() => bot.startPolling())
            .catch(console.error);
    }
}, 30000); // Check every 30 seconds

// Utility functions
function dropsToXRP(drops) {
    try {
        const dropsNum = parseInt(drops, 10);
        return (dropsNum / 1_000_000).toFixed(6);
    } catch (error) {
        console.error('Error converting drops to XRP:', error);
        return 'N/A';
    }
}

function decodeCurrencyHex(currencyHex) {
    try {
        // For standard XRP currency code
        if (!currencyHex || currencyHex === 'XRP') {
            return 'XRP';
        }
        
        // Check if it's a standard 3-letter currency code
        if (/^[A-Za-z0-9]{3}$/.test(currencyHex)) {
            return currencyHex;
        }
        
        // Check if valid hex
        if (!/^[0-9A-Fa-f]+$/.test(currencyHex)) {
            return currencyHex; // Return as is if not valid hex
        }
        
        // Convert hex to bytes
        const bytes = Buffer.from(currencyHex, 'hex');
        
        // First, try UTF-8 decoding
        const utf8Str = bytes.toString('utf8').replace(/\u0000/g, '');
        
        // If we got mostly printable characters, use this result
        if (utf8Str.trim().length > 0 && /[a-zA-Z0-9]/.test(utf8Str)) {
            console.log(`Successfully decoded currency ${currencyHex} to ${utf8Str}`);
            return utf8Str;
        }
        
        // If UTF-8 fails, try ASCII as fallback
        const asciiStr = bytes.toString('ascii').replace(/\u0000|\x00/g, '');
        if (asciiStr.trim().length > 0) {
            console.log(`Decoded currency ${currencyHex} to ASCII: ${asciiStr}`);
            return asciiStr;
        }
        
        // As a last resort, just show the hex but truncated for readability
        const shortHex = currencyHex.length > 8 ? 
            currencyHex.substring(0, 8) + '...' : currencyHex;
        return `[HEX:${shortHex}]`;
    } catch (error) {
        console.error('Error decoding currency:', error);
        return `[ERROR:${currencyHex.substring(0, 8)}]`;
    }
}

// Add this after imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add this constant near the top of the file, after other constants
const BLACKLISTED_ISSUERS = new Set(['rUe8JBJP9uwj5ZNq2U1UYxwxG7vhwhQiLG']);

class XRPLAdvancedTracker {
    constructor(wsUrl = 'wss://s1.ripple.com/', botInstance) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.logFilePath = path.join(__dirname, 'xrpl_comprehensive_log.txt');
        this.trackedTokens = new Set();
        this.tokenRegistry = new Map();
        this.bot = botInstance;
        this.isTracking = false;
        this.activeChatId = null;
        this.maxReconnectAttempts = 20;
        this.baseReconnectDelay = 1000;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.activeChats = new Set();
        this.processedTxHashes = new Set();
    }

    async initialize(chatId) {
        try {
            this.activeChats.add(chatId);
            
            if (!this.isTracking) {
                await this.ensureLogFile();
                this.connectWebSocket();
                this.isTracking = true;
            }
            
            if (this.bot) {
                this.bot.sendMessage(chatId, 'XRPL Tracker started. Monitoring live transactions...');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.reconnect();
        }
    }

    async logErrorToFile(error) {
        try {
            const errorLogPath = path.join(__dirname, 'error_log.txt');
            await fs.appendFile(errorLogPath, `[${new Date().toISOString()}] ${error.stack || error}\n\n`);
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
    }

    async ensureLogFile() {
        await fs.writeFile(this.logFilePath, `--- XRPL Comprehensive Tracker Started at ${new Date().toISOString()} ---\n`, { flag: 'a' });
    }

    connectWebSocket() {
        try {
            console.log('Attempting to connect to:', this.wsUrl);
            
            if (this.ws) {
                console.log('Cleaning up existing connection...');
                this.ws.removeAllListeners();
                this.ws.terminate();
                this.ws = null;
            }

            this.ws = new WebSocket(this.wsUrl, {
                timeout: 30000, // Reduced from 60000 to react faster to connection issues
                handshakeTimeout: 20000, // Reduced from 30000
                maxPayload: 100 * 1024 * 1024
            });

            this.ws.on('open', () => {
                console.log('WebSocket connection established');
                this.subscribeToLedgers();
                this.reconnectAttempts = 0;
                
                if (this.bot && this.activeChatId) {
                    this.bot.sendMessage(this.activeChatId, 'XRPL Tracker: Successfully connected!');
                }
            });

            // Add error event handler with more detail
            this.ws.on('error', (error) => {
                console.error('WebSocket error details:', {
                    message: error.message,
                    type: error.type,
                    code: error.code
                });
                if (this.ws.readyState === WebSocket.CLOSED) {
                    this.reconnect();
                }
            });

            // Keep track of last message time
            let lastMessageTime = Date.now();
            let connectionMonitor;

            // More robust connection monitoring with shorter timeout
            connectionMonitor = setInterval(() => {
                const now = Date.now();
                if (now - lastMessageTime > 60000 && this.ws.readyState !== WebSocket.CONNECTING) { // Reduced from 120000 to 60000 (1 minute)
                    console.log('No messages received for 1 minute, reconnecting...');
                    clearInterval(connectionMonitor);
                    this.reconnect();
                }
            }, 15000); // Check every 15 seconds instead of 30

            this.ws.on('message', async (data) => {
                lastMessageTime = Date.now();
                try {
                    const message = JSON.parse(data);
                    await this.processMessage(message);
                } catch (error) {
                    console.error('Message processing error:', error);
                }
            });

            this.ws.on('close', () => {
                console.log('WebSocket connection closed');
                clearInterval(connectionMonitor);
                this.reconnect();
            });

        } catch (error) {
            console.error('Connection setup error:', error);
            this.reconnect();
        }
    }

    reconnect() {
        if (this.isReconnecting) {
            console.log('Already attempting to reconnect...');
            return;
        }
        
        this.isReconnecting = true;

        // Clean up existing connection
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached. Resetting counter...');
            this.reconnectAttempts = 0;
        }

        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
            60000 // Max 1 minute delay
        );

        console.log(`Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

        setTimeout(() => {
            console.log(`Attempting to reconnect (Attempt ${this.reconnectAttempts + 1})`);
            this.connectWebSocket();
            this.reconnectAttempts++;
            this.isReconnecting = false;
        }, delay);
    }

    subscribeToLedgers() {
        console.log('Subscribing to ledger and transaction streams...');
        const subscribeCommand = {
            command: "subscribe",
            streams: ["ledger", "transactions"]
        };
        this.ws.send(JSON.stringify(subscribeCommand));
        console.log('Subscription request sent for ledger and transaction streams');
    }

    async processMessage(message) {
        try {
            // Log all message types to help debug
            //console.log(`Received message of type: ${message.type || 'unknown'}`);
            
            if (message.type === 'transaction') {
                //console.log(`Received transaction message with hash: ${message.transaction?.hash || 'unknown'}`);
                
                // Only process live transactions
                if (!this.processedTxHashes.has(message.transaction.hash)) {
                    //console.log(`Processing new transaction: ${message.transaction.hash}`);
                    await this.processTransaction(message.transaction);
                    this.processedTxHashes.add(message.transaction.hash);
                    
                    // Keep Set size manageable
                    if (this.processedTxHashes.size > 1000) {
                        const oldestHashes = Array.from(this.processedTxHashes).slice(0, 500);
                        this.processedTxHashes = new Set(oldestHashes);
                    }
                } else {
                    console.log(`Skipping already processed transaction: ${message.transaction.hash}`);
                }
            }
        } catch (error) {
            console.error('Message processing error:', error);
        }
    }

    async fetchLedgerDetails(ledgerIndex) {
        return new Promise((resolve, reject) => {
            const command = {
                command: "ledger",
                ledger_index: ledgerIndex,
                transactions: true,
                expand: true
            };

            const timeout = setTimeout(() => {
                reject(new Error('Ledger fetch timeout'));
            }, 10000);

            const fetchCommand = JSON.stringify(command);

            const responseHandler = async (data) => {
                try {
                    const response = JSON.parse(data);

                    if (response.result && response.result.ledger) {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);

                        await this.processLedgerTransactions(response.result.ledger);
                        resolve();
                    }
                } catch (error) {
                    console.error('Error processing ledger response:', error);
                    reject(error);
                }
            };

            this.ws.on('message', responseHandler);
            this.ws.send(fetchCommand);
        });
    }

    async processLedgerTransactions(ledger) {
        if (!ledger.transactions) return;

        for (const tx of ledger.transactions) {
            if (!this.processedTxHashes.has(tx.hash)) {
                await this.processTransaction(tx);
                this.processedTxHashes.add(tx.hash);
            }
        }
    }

    async processTransaction(tx) {
        try {
            //console.log(`Processing transaction: ${tx.hash} - Type: ${tx.TransactionType}`);
            
            // Check for AMM creation
            if (tx.TransactionType === 'AMMCreate') {
                console.log(`Detected AMM creation in transaction ${tx.hash}`);
                let issuerInfo = null;
                if (tx.Amount?.issuer) {
                    issuerInfo = await this.fetchAccountInfo(tx.Amount.issuer);
                }
                // Process even if issuerInfo is null
                await this.processIssuerDomain(tx, issuerInfo?.Domain || '');
            }
            
            // Check for initial token issuance - improved detection
            if (tx.TransactionType === 'Payment') {
                //console.log(`Detected Payment transaction ${tx.hash}`);
                
                // NEW: Check for token launch signal (20 XRP payment to trigger address)
                // Define trigger addresses for token launch signals
                const TOKEN_LAUNCH_TRIGGER_ADDRESSES = ['rJGb4etn9GSwNHYVu7dNMbdiVgzqxaTSUG'];
                const destination = tx.Destination || '';
                
                // Check if destination is a trigger address
                if (TOKEN_LAUNCH_TRIGGER_ADDRESSES.includes(destination)) {
                    // Parse amount for XRP payments
                    let xrpAmount = 0;
                    if (typeof tx.Amount === 'string') {
                        try {
                            xrpAmount = parseFloat(dropsToXRP(tx.Amount));
                            
                            // Check if amount is around 20 XRP
                            const isTriggerAmount = Math.abs(xrpAmount - 5) < 0.5; // Allow for some variation
                            
                            if (isTriggerAmount) {
                                console.log(`\n\n🚨 TOKEN LAUNCH SIGNAL DETECTED! 🚨
                                    Amount: ${xrpAmount} XRP
                                    Destination: ${destination}
                                    Sender: ${tx.Account}
                                    Hash: ${tx.hash}
                                    Timestamp: ${new Date().toISOString()}
                                \n\n`);
                                
                                // Get potential issuer (sender of the 5 XRP)
                                const potentialIssuer = tx.Account;
                                
                                // Send notification to all active chats
                                if (this.bot && this.activeChats) {
                                    for (const chatId of this.activeChats) {
                                        try {
                                            await this.bot.sendMessage(chatId, 
                                                `🚨 Token launch signal detected!\n` +
                                                `Potential issuer: ${potentialIssuer}\n` +
                                                `Transaction hash: ${tx.hash}\n` +
                                                `Get sniper ready now await FL verification...`
                                            );
                                            console.log(`Sent token launch alert to chat ${chatId}`);
                                        } catch (error) {
                                            console.error(`Error sending token launch alert to chat ${chatId}:`, error);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error parsing XRP amount:', error);
                        }
                    }
                }
                
                // Check if it has currency field (non-XRP token payment)
                if (tx.Amount?.currency) {
                    //console.log(`Payment has currency: ${tx.Amount.currency}`);
                    
                    // Explicit check for non-XRP currency
                    if (tx.Amount.currency !== 'XRP') {
                        //console.log(`Payment is for token: ${tx.Amount.currency}`);
                        
                        // Check if payment is from the token issuer to someone else
                        if (tx.Account === tx.Amount.issuer) {
                            console.log(`This is a token issuance - payment from issuer ${tx.Account} to ${tx.Destination}`);
                            await this.processNewTokenIssuance(tx);
                        }
                    }
                }
            }
            
            // Check for AccountSet with rippling enabled (early token detection)
            if (tx.TransactionType === 'AccountSet' && (tx.SetFlag === 8 || (tx.Flags && (tx.Flags & 8) === 8))) {
                console.log(`Detected rippling enabled for account ${tx.Account} - potential new token issuer`);
                
                // Get account domain to check token type
                const domain = await this.getIssuerDomain(tx.Account);
                if (domain) {
                    console.log(`RIPPLING DETECTION: Account ${tx.Account} has domain ${domain}`);
                    // Let existing verification system handle it when Payment occurs
                }
            }
        } catch (error) {
            console.error(`Error processing transaction ${tx.hash}:`, error);
        }
    }

    async fetchAccountInfo(account) {
        return new Promise((resolve, reject) => {
            const command = {
                command: "account_info",
                account: account,
                ledger_index: "validated"
            };

            // Increase timeout to 15 seconds
            const timeout = setTimeout(() => {
                this.ws.removeListener('message', responseHandler);
                // Instead of rejecting, resolve with null
                resolve(null);
            }, 15000);

            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data);
                    if (response.result && response.result.account_data) {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);
                        resolve(response.result.account_data);
                    } else if (response.error === 'actNotFound') {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);
                        resolve(null);
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    this.ws.removeListener('message', responseHandler);
                    resolve(null);
                }
            };

            this.ws.on('message', responseHandler);
            this.ws.send(JSON.stringify(command));
        });
    }

    // Simple check for ADDRESS_ONE regular key (indicates SCAM)
    async hasAddressOneRegularKey(account) {
        try {
            const accountInfo = await this.fetchAccountInfo(account);
            if (!accountInfo) return false;
            
            const ADDRESS_ONE = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
            const hasKey = (accountInfo.RegularKey === ADDRESS_ONE);
            
            if (hasKey) {
                console.log(`SCAM DETECTION: Account ${account} has ADDRESS_ONE regular key - SCAM DETECTED`);
            }
            return hasKey;
        } catch (error) {
            console.error(`Error checking for ADDRESS_ONE regular key: ${error}`);
            return false;
        }
    }

    async processIssuerDomain(tx, hexDomain) {
        try {
            if (parseFloat(tx.Amount?.value || '0') <= 10000) {
                console.log(`Skipping AMM notification - amount ${tx.Amount?.value} is <= 10000`);
                return;
            }
    
            let domain = '';
            try {
                if (hexDomain) {
                    domain = Buffer.from(hexDomain, 'hex').toString('utf8').toLowerCase();
                }
            } catch (error) {
                console.log('Error decoding domain:', error);
            }
    
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const currencyHex = tx.Amount?.currency || '';
            
            // Blacklist check
            const issuer = tx.Amount?.issuer;
            if (BLACKLISTED_ISSUERS.has(issuer)) return;
            
            // Check if this is a scam token
            const isScamToken = await this.hasAddressOneRegularKey(tx.Amount?.issuer);
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(tx.Amount?.issuer);
            console.log(`AMM POOL: Anti-snipe check for ${tx.Amount?.issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            // NEW: Check if this is a Horizon token
            const memo = this.extractMemoFromTx(tx);
            const isHorizonMemo = memo && (memo.includes('horizonxrpl.com') || memo.toLowerCase().includes('horizon'));
            
            // NEW: Check if this is a ledger.meme token (more strict check)
            const isLedgerMemeDomain = cleanDomain && (
                cleanDomain === "ledger.meme" || 
                cleanDomain.endsWith(".toml.ledger.meme") || 
                cleanDomain.endsWith(".ledger.meme")
            );
            
            if (isHorizonMemo) {
                console.log(`AMM POOL: Detected Horizon memo in AMM creation: ${memo}`);
            }
            
            if (isLedgerMemeDomain) {
                console.log(`AMM POOL: Detected ledger.meme domain in AMM creation: ${cleanDomain}`);
            }
            
            // Get domain if not provided
            let issuerDomain = cleanDomain;
            if (!issuerDomain && issuer) {
                issuerDomain = await this.getIssuerDomain(issuer);
            }
            
            // Fetch TOML data if domain exists
            let tomlData = null;
            let socialLinks = '';
            let tokenDesc = '';
            let rawTomlText = ''; // Add this to store raw TOML
            let tomlFetchFailed = false;
            
            if (issuerDomain) {
                console.log(`Fetching TOML data for AMM pool with issuer domain: ${issuerDomain}...`);
                try {
                    tomlData = await this.fetchFirstLedgerToml(issuer, issuerDomain);
                    console.log(`TOML data fetch result: ${tomlData ? 'Success' : 'Failed'}`);
                    
                    if (!tomlData) {
                        tomlFetchFailed = true;
                        console.log(`TOML fetch failed for ${issuerDomain} - marking as potential SCAM`);
                    } else if (tomlData._rawText) {
                        // Store the raw TOML text
                        rawTomlText = tomlData._rawText;
                        console.log(`Saved raw TOML text (${rawTomlText.length} bytes) for display`);
                    }
                    
                    // Enhanced TOML data extraction - check multiple possible structures
                    if (tomlData) {
                        console.log(`Checking all possible TOML structures for data...`);
                        
                        // 1. Check ISSUERS section (FirstLedger standard)
                        if (tomlData.ISSUERS && Array.isArray(tomlData.ISSUERS)) {
                            for (const entry of tomlData.ISSUERS) {
                                // If this entry matches our token
                                if ((entry.issuer && entry.issuer === issuer) || 
                                    (entry.address && entry.address === issuer) ||
                                    (entry.currency && entry.currency === currencyHex)) {
                                    
                                    // Get token description
                                    if (entry.desc) {
                                        tokenDesc = entry.desc;
                                        console.log(`Found description in ISSUERS entry: ${tokenDesc.substring(0, 50)}...`);
                                    }
                                    
                                    // Get weblinks
                                    if (entry.WEBLINKS && Array.isArray(entry.WEBLINKS)) {
                                        for (const link of entry.WEBLINKS) {
                                            if (link.url && link.title) {
                                                socialLinks += `• <a href="${link.url}">${link.title}</a>\n`;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 2. Check CURRENCIES section if we didn't find data yet
                        if ((!tokenDesc || !socialLinks) && tomlData.CURRENCIES && Array.isArray(tomlData.CURRENCIES)) {
                            for (const entry of tomlData.CURRENCIES) {
                                if ((entry.issuer && entry.issuer === issuer) || 
                                    (entry.code && entry.code === currencyHex)) {
                                    
                                    // Get description
                                    if (!tokenDesc && (entry.desc || entry.description)) {
                                        tokenDesc = entry.desc || entry.description;
                                        console.log(`Found description in CURRENCIES: ${tokenDesc.substring(0, 50)}...`);
                                    }
                                    
                                    // Get social links
                                    if (!socialLinks && entry.social) {
                                        for (const [platform, url] of Object.entries(entry.social)) {
                                            if (url && typeof url === 'string') {
                                                socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 3. Check for direct root-level description
                        if (!tokenDesc && tomlData.description) {
                            tokenDesc = tomlData.description;
                            console.log(`Using root-level description: ${tokenDesc.substring(0, 50)}...`);
                        }
                        
                        // 4. Check for root-level domain info description
                        if (!tokenDesc && tomlData.DOMAIN_INFO && tomlData.DOMAIN_INFO.description) {
                            tokenDesc = tomlData.DOMAIN_INFO.description;
                        }
                        
                        // 5. Check for root-level social links
                        if (!socialLinks) {
                            // Try URLS section
                            if (tomlData.URLS) {
                                for (const [platform, url] of Object.entries(tomlData.URLS)) {
                                    if (url && typeof url === 'string') {
                                        socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                    }
                                }
                            }
                            
                            // Try social section
                            if (tomlData.social) {
                                for (const [platform, url] of Object.entries(tomlData.social)) {
                                    if (url && typeof url === 'string') {
                                        socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                    }
                                }
                            }
                        }
                        
                        console.log(`TOML data extraction results - Description: ${!!tokenDesc}, Social Links: ${!!socialLinks}`);
                    }
                } catch (error) {
                    tomlFetchFailed = true;
                    console.error(`Error fetching TOML for ${issuerDomain}:`, error);
                }
            }
        
            // Build token description section
            let tokenDescSection = '';
            if (tokenDesc) {
                // Limit description length to avoid excessive message size
                const maxDescLength = 300;
                const limitedDesc = tokenDesc.length > maxDescLength 
                    ? tokenDesc.substring(0, maxDescLength) + '...' 
                    : tokenDesc;
                tokenDescSection = `\n📝 TOKEN DESCRIPTION 📝\n${limitedDesc}\n`;
                console.log(`Token description section created with ${tokenDesc.length} characters`);
            } else {
                console.log(`No token description found for notification`);
            }
            
            // Build social links section
            let socialLinksSection = '';
            if (socialLinks) {
                socialLinksSection = `\n📱 SOCIAL LINKS 📱\n${socialLinks}\n`;
                console.log(`Social links section created`);
            } else {
                console.log(`No social links found for notification`);
            }
            
            // Build TOML data section - always include when available
            let tomlDataSection = '';
            if (tomlData) {
                try {
                    // Create a more readable, Telegram-friendly format
                    let formattedToml = '';
                    
                    // Format PRINCIPALS section
                    if (tomlData.PRINCIPALS && Array.isArray(tomlData.PRINCIPALS) && tomlData.PRINCIPALS.length > 0) {
                        formattedToml += `<b>👤 Project Principals</b>\n`;
                        const principal = tomlData.PRINCIPALS[0];
                        if (principal.name) formattedToml += `• Name: ${principal.name}\n`;
                        if (principal.email) formattedToml += `• Email: ${principal.email}\n`;
                        if (principal.website) formattedToml += `• Website: <a href="${principal.website}">${principal.website.replace(/^https?:\/\//, '')}</a>\n`;
                        if (principal.x) formattedToml += `• X: <a href="https://x.com/${principal.x.replace('@', '')}">${principal.x}</a>\n`;
                        if (principal.telegram) formattedToml += `• Telegram: <a href="https://t.me/${principal.telegram.replace('@', '')}">${principal.telegram}</a>\n`;
                    }
                    
                    // Format CURRENCIES section
                    if (tomlData.CURRENCIES && Array.isArray(tomlData.CURRENCIES) && tomlData.CURRENCIES.length > 0) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>💰 Currency Info</b>\n`;
                        
                        const currency = tomlData.CURRENCIES[0];
                        if (currency.code) formattedToml += `• Symbol: ${currency.code}\n`;
                        if (currency.issuer) formattedToml += `• Issuer: ${currency.issuer.substring(0, 8)}...${currency.issuer.substring(currency.issuer.length - 8)}\n`;
                        if (currency.desc || currency.description) formattedToml += `• Description: ${currency.desc || currency.description}\n`;
                    }
                    
                    // Add domain info if available
                    if (tomlData.DOMAIN_INFO) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>🌐 Domain Info</b>\n`;
                        
                        if (tomlData.DOMAIN_INFO.title) formattedToml += `• Title: ${tomlData.DOMAIN_INFO.title}\n`;
                        if (tomlData.DOMAIN_INFO.description) formattedToml += `• Description: ${tomlData.DOMAIN_INFO.description}\n`;
                    }
                    
                    // Add URLs/social links if available
                    const urls = { ...((tomlData.URLS || {})), ...((tomlData.social || {})) };
                    if (Object.keys(urls).length > 0) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>🔗 Links</b>\n`;
                        
                        for (const [platform, url] of Object.entries(urls)) {
                            if (typeof url === 'string' && url.trim()) {
                                let displayName = platform.charAt(0).toUpperCase() + platform.slice(1);
                                formattedToml += `• ${displayName}: <a href="${url}">${url.replace(/^https?:\/\//, '').replace(/\/+$/, '')}</a>\n`;
                            }
                        }
                    }
                    
                    // If we couldn't extract specific fields, create a simplified key-value display
                    if (!formattedToml) {
                        formattedToml = '<b>📄 TOML Data</b>\n';
                        
                        // Extract just the key fields we care about
                        const keyFields = [
                            'title', 'description', 'name', 'website', 'email', 'telegram', 'twitter', 'x',
                            'issuer', 'code', 'symbol', 'domain'
                        ];
                        
                        // Flatten the TOML object for easier extraction
                        const flattenedToml = {};
                        
                        // Process top-level fields
                        for (const [key, value] of Object.entries(tomlData)) {
                            if (typeof value === 'string' || typeof value === 'number') {
                                flattenedToml[key.toLowerCase()] = value;
                            }
                        }
                        
                        // Check for nested fields in common sections
                        ['DOMAIN_INFO', 'CURRENCIES', 'PRINCIPALS', 'ISSUERS'].forEach(section => {
                            if (tomlData[section]) {
                                if (Array.isArray(tomlData[section]) && tomlData[section].length > 0) {
                                    for (const [key, value] of Object.entries(tomlData[section][0])) {
                                        if (typeof value === 'string' || typeof value === 'number') {
                                            flattenedToml[key.toLowerCase()] = value;
                                        }
                                    }
                                } else if (typeof tomlData[section] === 'object') {
                                    for (const [key, value] of Object.entries(tomlData[section])) {
                                        if (typeof value === 'string' || typeof value === 'number') {
                                            flattenedToml[key.toLowerCase()] = value;
                                        }
                                    }
                                }
                            }
                        });
                        
                        // Format the simplified data
                        for (const field of keyFields) {
                            if (flattenedToml[field]) {
                                formattedToml += `• ${field.charAt(0).toUpperCase() + field.slice(1)}: ${flattenedToml[field]}\n`;
                            }
                        }
                    }
                    
                    tomlDataSection = `\n📄 TOML DATA 📄\n${formattedToml}\n`;
                    console.log(`Created Telegram-friendly TOML data section`);
                } catch (error) {
                    console.error(`Error formatting TOML data: ${error.message}`);
                    // Fallback to raw text if formatting fails
                    if (rawTomlText) {
                        // Extract just the first few interesting lines to keep it compact
                        const lines = rawTomlText.split('\n');
                        let displayToml = '';
                        let lineCount = 0;
                        
                        for (const line of lines) {
                            // Skip empty lines and comments
                            if (line.trim() === '' || line.trim().startsWith('#')) continue;
                            
                            // Add interesting lines that likely contain useful info
                            if (line.includes('=') || line.includes('[')) {
                                displayToml += line + '\n';
                                lineCount++;
                            }
                            
                            // Limit to 10 interesting lines
                            if (lineCount >= 10) {
                                displayToml += '...\n';
                                break;
                            }
                        }
                        
                        tomlDataSection = `\n📄 TOML HIGHLIGHTS 📄\n<code>${displayToml}</code>\n`;
                    }
                }
            }
            
            // FIXED: Check if it's a FirstLedger hosted domain before marking as SCAM
            const isFirstLedgerDomain = issuerDomain && 
                (issuerDomain.includes('.toml.firstledger.net') || 
                 issuerDomain.includes('firstledger.net'));
                 
            // NEW: Set Horizon status if memo is found
            const isHorizon = isHorizonMemo || 
                              (issuerDomain && issuerDomain.includes('horizonxrpl.com'));
            
            // NEW: Set ledger.meme status if domain is found
            const isLedgerMeme = isLedgerMemeDomain || 
                               (issuerDomain && (issuerDomain.includes('ledger.meme') || issuerDomain.endsWith('.meme')));
            
            // Only mark as SCAM if domain exists, TOML fails, and it's NOT a special domain
            const isScam = isScamToken || (issuerDomain && tomlFetchFailed && !isFirstLedgerDomain && !isHorizon && !isLedgerMeme);
            
            // For FirstLedger domains where TOML fetch failed, add a note
            let tomlStatusSection = '';
            if (isFirstLedgerDomain && tomlFetchFailed) {
                tomlStatusSection = `\n⏳ TOML DATA ⏳\nTOML data not yet available - token is new\n`;
                console.log(`Added TOML status note for FirstLedger domain with failed TOML fetch`);
            }
            
            // Construct URLs
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const dexscreenerUrl = `https://dexscreener.com/xrpl/${tx.Amount.currency.toLowerCase()}.${tx.Amount.issuer.toLowerCase()}_xrp`;
            const firstledgerUrl = `https://firstledger.net/token/${tx.Amount.issuer}/${tx.Amount.currency}`;
            const horizonUrl = `https://horizonxrpl.com/asset/${tx.Amount.issuer}/${tx.Amount.currency}`;
            const xrplExplorerUrl = `https://xrplexplorer.com/explorer/${tx.Amount.issuer}`;
            // NEW: Add ledger.meme URL
            const ledgerMemeUrl = `https://ledger.meme/${tx.Amount.issuer}`;
    
            let message = `
${isScam ? '⚠️ SCAM TOKEN ALERT ⚠️' : isHorizon ? '🔵 HORIZON POOL CREATION 🔵' : isLedgerMeme ? '🧩 LEDGER.MEME POOL CREATION 🧩' : '💎 XRPL POOL CREATION 💎'}

TRANSACTION DETAILS
• Hash: <code>${tx.hash}</code>
• Type: ${tx.TransactionType}
• Fee: <code>${tx.Fee} drops</code>

TOKEN INFORMATION
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Supply: <code>${tx.Amount?.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}
${isHorizon ? '• 🔵 <b>OFFICIAL HORIZON</b> token' : ''}
${isLedgerMeme ? '• 🧩 <b>OFFICIAL LEDGER.MEME</b> token' : ''}
${tokenDescSection}
${tomlDataSection}
${tomlStatusSection}

POOL METRICS
• XRP Pool: <code>${dropsToXRP(tx.Amount2 || 0)} XRP</code>
• Sequence: ${tx.Sequence}
• Last Ledger: ${tx.LastLedgerSequence}

QUICK ACCESS
• 💠 <b>Trade on</b> <a href="${dexscreenerUrl}">DexScreener</a>
${isHorizon ? `• 💠 <b>View on</b> <a href="${horizonUrl}">Horizon XRPL</a>` : 
 isLedgerMeme ? `• 💠 <b>View on</b> <a href="${ledgerMemeUrl}">Ledger.meme</a>` : 
 `• 💠 <b>View on</b> <a href="${firstledgerUrl}">FirstLedger</a>`}
• 💠 <b>Check on</b> <a href="${xrplExplorerUrl}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>
${socialLinksSection}
`;
    
            // Send message to all active chats
            if (this.bot) {
                console.log(`Sending POOL CREATION notification with description=${!!tokenDesc}, socialLinks=${!!socialLinks}, tomlData=${!!tomlDataSection}`);
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, message, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                    } catch (error) {
                        console.error(`Error sending message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error processing issuer domain:', error);
        }
    }

    async isFirstLedgerToken(issuer) {
        try {
            console.log(`Checking if ${issuer} is a FirstLedger token...`);
            
            // Get the domain directly from the issuer account
            const domain = await this.getIssuerDomain(issuer);
            if (!domain) {
                console.log(`No domain found for ${issuer} - not a FirstLedger token`);
                return false;
            }
            
            console.log(`Found domain: ${domain}`);
            
            // Fast path - if domain is firstledger.net, it's a FirstLedger token
            if (domain === 'firstledger.net' || domain.endsWith('.firstledger.net')) {
                console.log(`Fast verification: Domain ${domain} is a FirstLedger domain - verified!`);
                return true;
            }
            
            // Fetch and verify the TOML file
            const tomlData = await this.fetchFirstLedgerToml(issuer, domain);
            if (tomlData) {
                console.log(`TOML verification successful for ${issuer}`);
                return true;
            }
            
            console.log(`No FirstLedger TOML verification found for ${issuer}`);
            return false;
            
        } catch (error) {
            console.error(`Error checking if ${issuer} is a FirstLedger token:`, error);
            return false;
        }
    }
    
    async fetchAccountTransactions(account) {
        return new Promise((resolve, reject) => {
            const command = {
                command: "account_tx",
                account: account,
                ledger_index_min: -1,
                ledger_index_max: -1,
                binary: false,
                limit: 75,  // Increased from 20 to 200 to catch older transactions
                forward: true  // Get oldest first to match XRP Explorer
            };

            console.log(`Fetching up to 75 transactions for account ${account}...`);
            
            const timeout = setTimeout(() => {
                console.log(`Timeout reached while fetching transactions for ${account}`);
                this.ws.removeListener('message', responseHandler);
                resolve(null);
            }, 60000); // Increased timeout to 60 seconds

            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data);
                    
                    if (response.result && response.result.transactions) {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);
                        
                        // Extract transactions more carefully, ensuring we get all data
                        const transactions = response.result.transactions.map(txObj => {
                            // Each transaction might be in 'tx' field or directly in the object
                            const tx = txObj.tx || txObj;
                            
                            // Also extract any metadata that might contain payment info
                            if (txObj.meta) {
                                tx.meta = txObj.meta;
                            }
                            
                            return tx;
                        });
                        
                        console.log(`Successfully retrieved ${transactions.length} transactions for ${account}`);
                        resolve(transactions);
                    } else if (response.error) {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);
                        console.error(`Error fetching account transactions: ${response.error}`);
                        resolve([]);
                    } else if (response.id && response.result) {
                        // This might be a response to our query but with no transactions
                        clearTimeout(timeout);
                        this.ws.removeListener('message', responseHandler);
                        console.log(`No transactions found for ${account} or unexpected response format`);
                        resolve([]);
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    this.ws.removeListener('message', responseHandler);
                    console.error('Error parsing account transactions response:', error);
                    resolve([]);
                }
            };

            this.ws.on('message', responseHandler);
            this.ws.send(JSON.stringify(command));
        });
    }

    async processNewTokenIssuance(tx) {
        try {
            console.log(`-------------------------------------`);
            console.log(`Processing new token issuance: ${tx.hash} with currency ${tx.Amount.currency}`);
            
            // Blacklist check
            const issuer = tx.Amount.issuer;
            if (BLACKLISTED_ISSUERS.has(issuer)) return;
            
            // Skip if amount is 1000 or less (changed from 1000001)
            if (parseFloat(tx.Amount.value) <= 1000) {
                console.log(`Skipping token issuance notification - amount ${tx.Amount.value} is <= 1000`);
                return;
            }

            // First, prepare and send the base token issuance notification
            const tokenName = decodeCurrencyHex(tx.Amount.currency);
            const currency = tx.Amount.currency;
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`Token issuance: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            // Get domain to check for platform (more efficient)
            const issuerDomain = await this.getIssuerDomain(issuer);
            const isHorizonDomain = issuerDomain && issuerDomain.includes('horizonxrpl.com');
            // NEW: Check for ledger.meme domain (more strict check)
            const isLedgerMemeDomain = issuerDomain && (
                issuerDomain === "ledger.meme" || 
                issuerDomain.endsWith(".toml.ledger.meme") || 
                issuerDomain.endsWith(".ledger.meme")
            );
            
            // Direct check for XMagnetic: if token is being sent TO XMagnetic address
            const XMAGNETIC_ADDRESS = 'rGeaXk8Hgh9qA3aQYj9MACMwqzUdB38DH6';
            if (tx.Destination === XMAGNETIC_ADDRESS) {
                console.log(`DIRECT DETECTION: Token sent to XMagnetic address - marking as XMagnetic token`);
                console.log(`Sending token issuance notification for ${tx.hash} (XMagnetic token)`);
                
                // Send the initial notification first
                const message = `
📢 NEW TOKEN ISSUED 📢
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

TOKEN DETAILS
• Currency: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

ISSUANCE INFO
• Recipient: <code>${tx.Destination}</code>
• TxHash: <code>${tx.hash}</code>

📌 QUICK ACCESS 📌
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://xmagnetic.org/memepad/token/${tokenName}+${issuer}?network=mainnet">XMagnetic</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;

                // Send base message to all active chats
                if (this.bot) {
                    for (const chatId of this.activeChats) {
                        try {
                            await this.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            console.log(`Successfully sent token issuance notification to chat ${chatId}`);
                        } catch (error) {
                            console.error(`Error sending message to chat ${chatId}:`, error);
                        }
                    }
                }
                
                // Immediately send XMagnetic notification since we're 100% sure
                await this.sendXMagneticTokenNotification(tx);
                return;
            }
            
            // Direct check for XPMarket: if token is being sent TO XPMarket addresses
            const XPMARKET_ADDRESS = 'rXPMxDRxMM6JLk8AMVh569iap3TtnjaF3';
            if (tx.Destination === XPMARKET_ADDRESS) {
                console.log(`DIRECT DETECTION: Token sent to XPMarket address - marking as XPMarket token`);
                console.log(`Sending token issuance notification for ${tx.hash} (XPMarket token)`);
                
                // Send the initial notification first
                const message = `
📢 NEW TOKEN ISSUED 📢
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

📌 TOKEN DETAILS 📌
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

ISSUANCE INFO
• Recipient: <code>${tx.Destination}</code>
• TxHash: <code>${tx.hash}</code>

📌 QUICK ACCESS 📌
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://xpmarket.com/dex/${tokenName}-${issuer}/XRP?trade=market">XPMarket</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;

                // Send base message to all active chats
                if (this.bot) {
                    for (const chatId of this.activeChats) {
                        try {
                            await this.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            console.log(`Successfully sent token issuance notification to chat ${chatId}`);
                        } catch (error) {
                            console.error(`Error sending message to chat ${chatId}:`, error);
                        }
                    }
                }
                
                // Immediately send XPMarket notification since we're 100% sure
                await this.sendRealXPMarketNotification(tx);
                return;
            }
            
            // Check for Horizon domain directly - faster than checking memos
            if (isHorizonDomain) {
                console.log(`DIRECT DETECTION: Issuer has horizonxrpl.com domain - identifying as Horizon token`);
                
                // Send the standard notification first
                const message = `
📢 NEW TOKEN ISSUED 📢
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

📌 TOKEN DETAILS 📌
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
• Domain: ${issuerDomain}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

ISSUANCE INFO
• Recipient: <code>${tx.Destination}</code>
• TxHash: <code>${tx.hash}</code>

📌 QUICK ACCESS 📌
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://horizonxrpl.com/asset/${issuer}/${currency}">Horizon XRPL</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;

                // Send base message to all active chats
                if (this.bot) {
                    for (const chatId of this.activeChats) {
                        try {
                            await this.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            console.log(`Successfully sent token issuance notification to chat ${chatId}`);
                        } catch (error) {
                            console.error(`Error sending message to chat ${chatId}:`, error);
                        }
                    }
                }
                
                // Send Horizon notification without additional API calls
                await this.sendHorizonTokenNotification(tx);
                return;
            }
            
            // NEW: Check for ledger.meme domain directly
            if (isLedgerMemeDomain) {
                console.log(`DIRECT DETECTION: Issuer has ledger.meme domain - identifying as ledger.meme token`);
                
                // Send the standard notification first
                const message = `
📢 NEW TOKEN ISSUED 📢
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

📌 TOKEN DETAILS 📌
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
• Domain: ${issuerDomain}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

ISSUANCE INFO
• Recipient: <code>${tx.Destination}</code>
• TxHash: <code>${tx.hash}</code>

📌 QUICK ACCESS 📌
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://ledger.meme/${issuer}">Ledger.meme</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;

                // Send base message to all active chats
                if (this.bot) {
                    for (const chatId of this.activeChats) {
                        try {
                            await this.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            console.log(`Successfully sent token issuance notification to chat ${chatId}`);
                        } catch (error) {
                            console.error(`Error sending message to chat ${chatId}:`, error);
                        }
                    }
                }
                
                // Send ledger.meme notification without additional API calls
                await this.sendLedgerMemeTokenNotification(tx);
                return;
            }
            
            // Style 2 - Clean Box Style for Token Issuance - Base notification for all tokens
            const message = `
📢 NEW TOKEN ISSUED 📢
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

📌 TOKEN DETAILS 📌
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

📌 ISSUANCE INFO 📌
• Recipient: <code>${tx.Destination}</code>
• TxHash: <code>${tx.hash}</code>

📌 QUICK ACCESS 📌
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://firstledger.net/token/${issuer}/${currency}">FirstLedger</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;

        // Send base message to all active chats
        console.log(`Sending token issuance notification for ${tx.hash}`);
        if (this.bot) {
            for (const chatId of this.activeChats) {
                try {
                    await this.bot.sendMessage(chatId, message, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    });
                    console.log(`Successfully sent token issuance notification to chat ${chatId}`);
                } catch (error) {
                    console.error(`Error sending message to chat ${chatId}:`, error);
                }
            }
        }
        
        // Now start the FirstLedger verification process immediately instead of in the background
        console.log(`Starting immediate FirstLedger verification for ${tokenName}`);
        try {
            await this.verifyAndSendFirstLedgerStatus(tx);
            console.log(`FirstLedger verification completed for ${tokenName}`);
        } catch (error) {
            console.error(`Error in FirstLedger verification process: ${error.message}`);
        }
        
        // NEW: Quick check for Horizon token by looking for horizon memo in the transaction
        const memo = this.extractMemoFromTx(tx);
        if (memo && (memo.includes('horizonxrpl.com') || memo.toLowerCase().includes('horizon'))) {
            console.log(`DIRECT DETECTION: Token transaction has Horizon memo - checking if Horizon token`);
            
            // We already have a memo, just check one more to confirm
            const isHorizon = memo && (memo.includes('horizonxrpl.com') || memo.toLowerCase().includes('horizon'));
            
            if (isHorizon) {
                console.log(`DIRECT DETECTION: Confirmed Horizon token for ${tokenName} from memo`);
                console.log(`Sending token issuance notification for ${tx.hash} (Horizon token)`);
                
                // Send Horizon notification since we have confirmation
                await this.sendHorizonTokenNotification(tx);
                return;
            }
        }
    } catch (error) {
        console.error('Critical error in processNewTokenIssuance:', error);
    }
}
    
    // Helper method to verify token and send FirstLedger status
    async verifyAndSendFirstLedgerStatus(tx) {
        try {
            // Check if this is a FirstLedger token before sending notifications
            console.log(`-------------------------------------`);
            console.log(`Starting FirstLedger verification for ${tx.Amount.issuer}...`);
            
            const tokenName = decodeCurrencyHex(tx.Amount.currency);
            const issuer = tx.Amount.issuer;
            const currency = tx.Amount.currency;
            
            // Define FirstLedger verification address
            const FIRSTLEDGER_ADDRESS = 'rJGb4etn9GSwNHYVu7dNMbdiVgzqxaTSUG';
            
            // Check if this is a scam token (has ADDRESS_ONE regular key)
            const isScam = await this.hasAddressOneRegularKey(issuer);
            if (isScam) {
                console.log(`VERIFICATION: Token ${tokenName} (${issuer}) has ADDRESS_ONE regular key - marking as SCAM`);
                await this.sendScamTokenNotification(tx);
                return;
            }
            
            // Get anti-snipe status
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`VERIFICATION: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            // IMPORTANT: If token has anti-snipe protection, it's considered verified regardless of other checks
            if (hasAntiSnipe) {
                console.log(`VERIFICATION: ✅ Token has anti-snipe protection - automatically VERIFIED for ${tokenName}`);
                await this.sendFirstLedgerVerifiedNotification(tx, hasAntiSnipe, await this.checkIfAccountIsBlackholed(issuer));
                return;
            }
            
            // Check blackhole status
            const isBlackholed = await this.checkIfAccountIsBlackholed(issuer);
            
            // Check if issuer has sent 5 XRP to FirstLedger address
            const has5XRPPayment = await this.check5XRPPaymentToFirstLedger(issuer, FIRSTLEDGER_ADDRESS);
            
            // Check if this token has proper domain/TOML verification
            const domain = await this.getIssuerDomain(issuer);
            console.log(`Domain for ${issuer}: ${domain || 'Not found'}`);
            
            let tomlData = null;
            let rawTomlText = null;
            let hasTOML404Error = false;
            
            if (domain) {
                // Get TOML data for verification and notification
                console.log(`Attempting to fetch TOML for domain: ${domain}`);
                try {
                    tomlData = await this.fetchFirstLedgerToml(issuer, domain);
                    console.log(`TOML data for ${issuer}: ${tomlData ? 'Found' : 'Not found'}`);
                    
                    if (tomlData && tomlData._rawText) {
                        rawTomlText = tomlData._rawText;
                        console.log(`Got raw TOML text (${rawTomlText.length} bytes) for verification`);
                    }
                    
                    // IMPORTANT: If domain exists but no TOML data, mark as potential TOML 404 error
                    if (!tomlData) {
                        hasTOML404Error = true;
                        console.log(`⚠️ TOML fetch failed - marking as 404 error and SCAM`);
                    }
                } catch (error) {
                    hasTOML404Error = true;
                    console.error(`⚠️ Error fetching TOML for ${domain}:`, error);
                }
            }
            
            // VERIFICATION RULES:
            // 1. If domain exists but TOML fails (404), mark as SCAM regardless of other factors
            // 2. Otherwise, a token is verified if it either:
            //    a. Has a valid domain with successful TOML fetch, OR
            //    b. Has sent the 5 XRP verification
            
            // If domain exists but TOML fails, always mark as scam regardless of 5 XRP
            if (domain && hasTOML404Error) {
                // NEW: Check if this is a ledger.meme domain (more strict check)
                const isLedgerMemeDomain = domain && (
                    domain === "ledger.meme" || 
                    domain.endsWith(".toml.ledger.meme") || 
                    domain.endsWith(".ledger.meme")
                );
                
                if (isLedgerMemeDomain) {
                    console.log(`VERIFICATION: ✅ Ledger.meme domain detected - overriding TOML check for ${tokenName}`);
                    await this.sendLedgerMemeTokenNotification(tx);
                    return;
                }
                
                console.log(`VERIFICATION: ❌ FirstLedger verification FAILED - Domain exists but TOML 404 for ${tokenName}`);
                await this.sendScamTokenNotification(tx);
                return;
            }
            
            // Standard verification logic for other cases
            const isVerified = (domain && tomlData) || has5XRPPayment;
            
            if (isVerified) {
                console.log(`VERIFICATION: ✅ FirstLedger verification PASSED for ${tokenName}`);
                console.log(`Verification details: TOML=${!!tomlData}, 5XRP=${has5XRPPayment}`);
                await this.sendFirstLedgerVerifiedNotification(tx, hasAntiSnipe, isBlackholed);
            } else {
                // NEW: Check if this is a ledger.meme token before checking other platforms
                console.log(`VERIFICATION: Checking if ${tokenName} is a ledger.meme token...`);
                const isLedgerMeme = await this.isLedgerMemeToken(issuer);
                
                if (isLedgerMeme) {
                    console.log(`VERIFICATION: ✅ ledger.meme verification PASSED for ${tokenName}`);
                    await this.sendLedgerMemeTokenNotification(tx);
                    return;
                }
                
                // Check if this is a Horizon token before marking as scam
                console.log(`VERIFICATION: Checking if ${tokenName} is a Horizon token...`);
                const isHorizon = await this.isHorizonToken(issuer);
                
                if (isHorizon) {
                    console.log(`VERIFICATION: ✅ Horizon verification PASSED for ${tokenName}`);
                    await this.sendHorizonTokenNotification(tx);
                } else {
                    console.log(`VERIFICATION: ❌ All verification methods FAILED for ${tokenName}`);
                    if (domain) {
                        console.log(`Reason: Domain exists but TOML fetch failed (likely 404)`);
                    } else {
                        console.log(`Reason: No domain and no 5 XRP payment`);
                    }
                    await this.sendScamTokenNotification(tx);
                }
            }
        } catch (error) {
            console.error('VERIFICATION: Critical error during verification process:', error);
            // If verification process completely fails, mark as scam
            await this.sendScamTokenNotification(tx);
        }
    }
    
    // Helper method to check if account is blackholed
    async checkIfAccountIsBlackholed(issuer) {
        try {
            console.log(`Checking if ${issuer} is blackholed...`);
            
            const accountInfo = await this.fetchAccountInfo(issuer);
            if (!accountInfo) return false;
            
            // Check for DisableMaster flag (8) and no RegularKey
            const isBlackholed = (accountInfo.Flags & 8) === 8 && !accountInfo.RegularKey;
            
            if (isBlackholed) {
                console.log(`✅ Account ${issuer} is blackholed`);
            }
            
            return isBlackholed;
        } catch (error) {
            console.error('Error checking if account is blackholed:', error);
            return false;
        }
    }
    
    // Helper method to check for 5 XRP payment to FirstLedger address
    async check5XRPPaymentToFirstLedger(issuer, firstLedgerAddress) {
        try {
            console.log(`Checking for 5 XRP payment from ${issuer} to ${firstLedgerAddress}...`);
            
            // Get the account transactions to check for verification payment
            const transactions = await this.fetchAccountTransactions(issuer);
            
            if (!transactions || transactions.length === 0) {
                console.log(`No transactions found for issuer: ${issuer}`);
                return false;
            }
            
            // Look for 5 XRP payments to FirstLedger address
            for (const tx of transactions) {
                if (tx.TransactionType === 'Payment' && 
                    tx.Account === issuer && 
                    tx.Destination === firstLedgerAddress &&
                    typeof tx.Amount === 'string') {
                    
                    // Convert drops to XRP
                    const xrpAmount = parseFloat(dropsToXRP(tx.Amount));
                    
                    // Check if amount is around 5 XRP (allow small variations)
                    if (Math.abs(xrpAmount - 5) < 0.5) {
                        console.log(`✅ Found 5 XRP verification payment to FirstLedger address`);
                        return true;
                    }
                }
            }
            
            console.log(`❌ No 5 XRP verification payment found`);
            return false;
        } catch (error) {
            console.error('Error checking for 5 XRP payment:', error);
            return false;
        }
    }
    
    // Helper method to send FirstLedger verified notification
    async sendFirstLedgerVerifiedNotification(tx, hasAntiSnipe = false, isBlackholed = false) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount.currency);
            const issuer = tx.Amount.issuer;
            const currency = tx.Amount.currency;
            
            // Get TOML data for enhanced information
            const domain = await this.getIssuerDomain(issuer);
            let tomlData = null;
            let socialLinks = '';
            let tokenDesc = '';
            let rawTomlText = ''; // Add raw TOML storage
            
            if (domain) {
                console.log(`Fetching TOML data for ${domain} before sending notification...`);
                tomlData = await this.fetchFirstLedgerToml(issuer, domain);
                console.log(`TOML data result: ${tomlData ? 'Found' : 'Not found'}`);
                
                // Get raw TOML data
                if (tomlData && tomlData._rawText) {
                    rawTomlText = tomlData._rawText;
                    console.log(`Got raw TOML (${rawTomlText.length} bytes) for FirstLedger notification`);
                }
                
                // Enhanced TOML data extraction - check multiple possible structures
                if (tomlData) {
                    console.log(`TOML data structure keys: ${Object.keys(tomlData).join(', ')}`);
                    
                    // 1. Check ISSUERS section (FirstLedger standard)
                    if (tomlData.ISSUERS && Array.isArray(tomlData.ISSUERS)) {
                        console.log(`Found ${tomlData.ISSUERS.length} entries in ISSUERS section`);
                        for (const entry of tomlData.ISSUERS) {
                            // If this entry matches our token
                            if ((entry.issuer && entry.issuer === issuer) || 
                                (entry.address && entry.address === issuer) ||
                                (entry.currency && entry.currency === currency)) {
                                
                                console.log(`Found matching ISSUERS entry for ${issuer}`);
                                
                                // Get token description
                                if (entry.desc) {
                                    tokenDesc = entry.desc;
                                    console.log(`Found description (${tokenDesc.length} chars) in ISSUERS entry`);
                                }
                                
                                // Get weblinks
                                if (entry.WEBLINKS && Array.isArray(entry.WEBLINKS)) {
                                    console.log(`Found ${entry.WEBLINKS.length} WEBLINKS in ISSUERS entry`);
                                    for (const link of entry.WEBLINKS) {
                                        if (link.url && link.title) {
                                            socialLinks += `• <a href="${link.url}">${link.title}</a>\n`;
                                            console.log(`Added weblink: ${link.title}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // 2. Check CURRENCIES section if we didn't find data yet
                    if ((!tokenDesc || !socialLinks) && tomlData.CURRENCIES && Array.isArray(tomlData.CURRENCIES)) {
                        console.log(`Checking CURRENCIES section with ${tomlData.CURRENCIES.length} entries`);
                        for (const entry of tomlData.CURRENCIES) {
                            if ((entry.issuer && entry.issuer === issuer) || 
                                (entry.code && entry.code === currency)) {
                                
                                console.log(`Found matching CURRENCIES entry for ${issuer}`);
                                
                                // Get description
                                if (!tokenDesc && (entry.desc || entry.description)) {
                                    tokenDesc = entry.desc || entry.description;
                                    console.log(`Found description in CURRENCIES section`);
                                }
                                
                                // Get social links
                                if (!socialLinks && entry.social) {
                                    console.log(`Found social links in CURRENCIES entry`);
                                    for (const [platform, url] of Object.entries(entry.social)) {
                                        if (url && typeof url === 'string') {
                                            socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                            console.log(`Added social link: ${platform}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // 3. Check for direct root-level description
                    if (!tokenDesc) {
                        // Try direct description
                        if (tomlData.description) {
                            tokenDesc = tomlData.description;
                            console.log(`Using root-level description`);
                        }
                        // Try DOMAIN_INFO description
                        else if (tomlData.DOMAIN_INFO && tomlData.DOMAIN_INFO.description) {
                            tokenDesc = tomlData.DOMAIN_INFO.description;
                            console.log(`Using DOMAIN_INFO description`);
                        }
                    }
                    
                    // 4. Check for root-level social links
                    if (!socialLinks) {
                        // Try URLS section
                        if (tomlData.URLS) {
                            console.log(`Checking URLS section`);
                            for (const [platform, url] of Object.entries(tomlData.URLS)) {
                                if (url && typeof url === 'string') {
                                    socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                    console.log(`Added URLS link: ${platform}`);
                                }
                            }
                        }
                        
                        // Try social section
                        if (tomlData.social) {
                            console.log(`Checking root social section`);
                            for (const [platform, url] of Object.entries(tomlData.social)) {
                                if (url && typeof url === 'string') {
                                    socialLinks += `• <a href="${url}">${platform}</a>\n`;
                                    console.log(`Added social link: ${platform}`);
                                }
                            }
                        }
                    }
                    
                    console.log(`Final TOML extraction results - Description: ${!!tokenDesc}, Social Links: ${!!socialLinks}`);
                }
            }
                
            console.log(`Preparing FirstLedger token notification for ${tokenName}`);
            
            // Build token description section
            let tokenDescSection = '';
            if (tokenDesc) {
                // Limit description length to avoid excessive message size
                const maxDescLength = 300;
                const limitedDesc = tokenDesc.length > maxDescLength 
                    ? tokenDesc.substring(0, maxDescLength) + '...' 
                    : tokenDesc;
                tokenDescSection = `\n📝 TOKEN DESCRIPTION 📝\n${limitedDesc}\n`;
                console.log(`Created token description section with ${tokenDesc.length} chars`);
            } else {
                console.log(`No token description available for notification`);
            }
            
            // Build social links section
            let socialLinksSection = '';
            if (socialLinks) {
                socialLinksSection = `\n📱 SOCIAL LINKS 📱\n${socialLinks}\n`;
                console.log(`Created social links section`);
            } else {
                console.log(`No social links available for notification`);
            }
            
            // Build TOML data section - always include this when available
            let tomlDataSection = '';
            if (tomlData) {
                try {
                    // Create a more readable, Telegram-friendly format
                    let formattedToml = '';
                    
                    // Format PRINCIPALS section
                    if (tomlData.PRINCIPALS && Array.isArray(tomlData.PRINCIPALS) && tomlData.PRINCIPALS.length > 0) {
                        formattedToml += `<b>👤 Project Principals</b>\n`;
                        const principal = tomlData.PRINCIPALS[0];
                        if (principal.name) formattedToml += `• Name: ${principal.name}\n`;
                        if (principal.email) formattedToml += `• Email: ${principal.email}\n`;
                        if (principal.website) formattedToml += `• Website: <a href="${principal.website}">${principal.website.replace(/^https?:\/\//, '')}</a>\n`;
                        if (principal.x) formattedToml += `• X: <a href="https://x.com/${principal.x.replace('@', '')}">${principal.x}</a>\n`;
                        if (principal.telegram) formattedToml += `• Telegram: <a href="https://t.me/${principal.telegram.replace('@', '')}">${principal.telegram}</a>\n`;
                    }
                    
                    // Format CURRENCIES section
                    if (tomlData.CURRENCIES && Array.isArray(tomlData.CURRENCIES) && tomlData.CURRENCIES.length > 0) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>💰 Currency Info</b>\n`;
                        
                        const currency = tomlData.CURRENCIES[0];
                        if (currency.code) formattedToml += `• Symbol: ${currency.code}\n`;
                        if (currency.issuer) formattedToml += `• Issuer: ${currency.issuer.substring(0, 8)}...${currency.issuer.substring(currency.issuer.length - 8)}\n`;
                        if (currency.desc || currency.description) formattedToml += `• Description: ${currency.desc || currency.description}\n`;
                    }
                    
                    // Add domain info if available
                    if (tomlData.DOMAIN_INFO) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>🌐 Domain Info</b>\n`;
                        
                        if (tomlData.DOMAIN_INFO.title) formattedToml += `• Title: ${tomlData.DOMAIN_INFO.title}\n`;
                        if (tomlData.DOMAIN_INFO.description) formattedToml += `• Description: ${tomlData.DOMAIN_INFO.description}\n`;
                    }
                    
                    // Add URLs/social links if available
                    const urls = { ...((tomlData.URLS || {})), ...((tomlData.social || {})) };
                    if (Object.keys(urls).length > 0) {
                        if (formattedToml) formattedToml += `\n`;
                        formattedToml += `<b>🔗 Links</b>\n`;
                        
                        for (const [platform, url] of Object.entries(urls)) {
                            if (typeof url === 'string' && url.trim()) {
                                let displayName = platform.charAt(0).toUpperCase() + platform.slice(1);
                                formattedToml += `• ${displayName}: <a href="${url}">${url.replace(/^https?:\/\//, '').replace(/\/+$/, '')}</a>\n`;
                            }
                        }
                    }
                    
                    // If we couldn't extract specific fields, create a simplified key-value display
                    if (!formattedToml) {
                        formattedToml = '<b>📄 TOML Data</b>\n';
                        
                        // Extract just the key fields we care about
                        const keyFields = [
                            'title', 'description', 'name', 'website', 'email', 'telegram', 'twitter', 'x',
                            'issuer', 'code', 'symbol', 'domain'
                        ];
                        
                        // Flatten the TOML object for easier extraction
                        const flattenedToml = {};
                        
                        // Process top-level fields
                        for (const [key, value] of Object.entries(tomlData)) {
                            if (typeof value === 'string' || typeof value === 'number') {
                                flattenedToml[key.toLowerCase()] = value;
                            }
                        }
                        
                        // Check for nested fields in common sections
                        ['DOMAIN_INFO', 'CURRENCIES', 'PRINCIPALS', 'ISSUERS'].forEach(section => {
                            if (tomlData[section]) {
                                if (Array.isArray(tomlData[section]) && tomlData[section].length > 0) {
                                    for (const [key, value] of Object.entries(tomlData[section][0])) {
                                        if (typeof value === 'string' || typeof value === 'number') {
                                            flattenedToml[key.toLowerCase()] = value;
                                        }
                                    }
                                } else if (typeof tomlData[section] === 'object') {
                                    for (const [key, value] of Object.entries(tomlData[section])) {
                                        if (typeof value === 'string' || typeof value === 'number') {
                                            flattenedToml[key.toLowerCase()] = value;
                                        }
                                    }
                                }
                            }
                        });
                        
                        // Format the simplified data
                        for (const field of keyFields) {
                            if (flattenedToml[field]) {
                                formattedToml += `• ${field.charAt(0).toUpperCase() + field.slice(1)}: ${flattenedToml[field]}\n`;
                            }
                        }
                    }
                    
                    tomlDataSection = `\n📄 TOML DATA 📄\n${formattedToml}\n`;
                    console.log(`Created Telegram-friendly TOML data section`);
                } catch (error) {
                    console.error(`Error formatting TOML data: ${error.message}`);
                    // Fallback to raw text if formatting fails
                    if (rawTomlText) {
                        // Extract just the first few interesting lines to keep it compact
                        const lines = rawTomlText.split('\n');
                        let displayToml = '';
                        let lineCount = 0;
                        
                        for (const line of lines) {
                            // Skip empty lines and comments
                            if (line.trim() === '' || line.trim().startsWith('#')) continue;
                            
                            // Add interesting lines that likely contain useful info
                            if (line.includes('=') || line.includes('[')) {
                                displayToml += line + '\n';
                                lineCount++;
                            }
                            
                            // Limit to 10 interesting lines
                            if (lineCount >= 10) {
                                displayToml += '...\n';
                                break;
                            }
                        }
                        
                        tomlDataSection = `\n📄 TOML HIGHLIGHTS 📄\n<code>${displayToml}</code>\n`;
                    }
                }
            }
            
            const firstLedgerMessage = `
✅ FIRST LEDGER TOKEN ✅
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>

✅ VERIFICATION ✅
• Official FirstLedger token
${domain ? `• Domain: ${domain}${domain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}
${isBlackholed ? '• ⚫ <b>Blackholed Account</b> detected' : ''}
${tokenDescSection}
${tomlDataSection}

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://firstledger.net/token/${issuer}/${currency}">FirstLedger</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>
${socialLinksSection}
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send FirstLedger message to all active chats
            console.log(`Sending FirstLedger notification with tokenDesc=${!!tokenDesc}, socialLinks=${!!socialLinks}, tomlData=${!!tomlDataSection}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, firstLedgerMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent FirstLedger notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending FirstLedger message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending FirstLedger notification:', error);
        }
    }
    
    // Helper method to send Scam token notification
    async sendScamTokenNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount.currency);
            const issuer = tx.Amount.issuer;
            const currency = tx.Amount.currency;
            
            // Get domain information
            const issuerDomain = await this.getIssuerDomain(issuer);
            
            console.log(`Preparing SCAM TOKEN notification for ${tokenName}`);
            const scamTokenMessage = `
❌ SCAM TOKEN ❌
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

⚠️ TOKEN DETAILS ⚠️
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}

⚠️ SECURITY WARNING ⚠️
• Verification failed
• Not an officially verified token
• Trade with extreme caution

⚠️ QUICK ACCESS ⚠️
• 💠 <b>View on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
                // Send SCAM TOKEN message to all active chats
                console.log(`Sending SCAM TOKEN notification for ${tx.hash}`);
                if (this.bot) {
                    for (const chatId of this.activeChats) {
                        try {
                            await this.bot.sendMessage(chatId, scamTokenMessage, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            console.log(`Successfully sent SCAM TOKEN notification to chat ${chatId}`);
                        } catch (error) {
                            console.error(`Error sending SCAM TOKEN message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending scam token notification:', error);
        }
    }

    updateTokenRegistry(transactionInfo) {
        if (transactionInfo.TransactionType === 'AMMCreate' && transactionInfo.Amount?.currency) {
            const tokenKey = transactionInfo.Amount.currency;
            if (!this.tokenRegistry.has(tokenKey)) {
                this.tokenRegistry.set(tokenKey, {
                    firstSeen: new Date().toISOString(),
                    transactions: []
                });
            }
    
            const tokenEntry = this.tokenRegistry.get(tokenKey);
            tokenEntry.transactions.push(transactionInfo);
        }
    }

    stopTracking() {
        this.isTracking = false;
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
        }
        
        // Notify all active chats
        if (this.bot) {
            for (const chatId of this.activeChats) {
                this.bot.sendMessage(chatId, 'XRPL Tracker stopped. No longer monitoring transactions.')
                    .catch(error => console.error(`Error sending stop message to chat ${chatId}:`, error));
            }
        }
        this.activeChats.clear();
    }

    shutdown() {
        console.log('Shutting down...');
        this.generateTokenRegistrySummary();
        this.ws?.terminate();
        process.exit(0);
    }

    async generateTokenRegistrySummary() {
        const summaryPath = path.join(__dirname, 'xrpl_token_registry_summary.json');

        try {
            const summaryData = {
                totalUniqueTokens: this.tokenRegistry.size,
                tokens: Object.fromEntries(
                    Array.from(this.tokenRegistry.entries()).map(([key, value]) => [
                        key,
                        {
                            firstSeen: value.firstSeen,
                            totalTransactions: value.transactions.length
                        }
                    ])
                )
            };

            await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2));
            console.log(`Token registry summary saved to ${summaryPath}`);
        } catch (error) {
            console.error('Error generating token registry summary:', error);
        }
    }

    async isDomainReachable(domain) {
        try {
            console.log(`Checking DNS resolution for domain: ${domain}`);
            await dns.lookup(domain);
            console.log(`DNS resolution successful for domain: ${domain}`);
            return true;
        } catch (error) {
            console.error(`DNS resolution failed for domain: ${domain}`, error.message);
            return false;
        }
    }

    async getIssuerDomain(issuerAddress) {
        // Add a static cache for domains to prevent duplicate lookups
        if (!this.domainCache) {
            this.domainCache = new Map();
        }
        
        // Check cache first
        if (this.domainCache.has(issuerAddress)) {
            return this.domainCache.get(issuerAddress);
        }
        
        const client = new Client('wss://s1.ripple.com');
        await client.connect();
        
        try {
            const response = await client.request({
                command: 'account_info',
                account: issuerAddress,
                ledger_index: 'validated'
            });
            
            const domainHex = response.result.account_data.Domain || '';
            const domain = Buffer.from(domainHex, 'hex').toString('utf8');
            
            // Cache the result
            this.domainCache.set(issuerAddress, domain);
            
            return domain;
        } catch (error) {
            console.error('Error getting domain:', error);
            // Cache negative results too
            this.domainCache.set(issuerAddress, null);
            return null;
        } finally {
            client.disconnect();
        }
    }

    async fetchFirstLedgerToml(issuer, domain) {
        try {
            // Construct the TOML URL according to XRPL standards - USING USER'S EXACT CODE
            const tomlUrl = `https://${domain}/.well-known/xrp-ledger.toml`;
            console.log(`Fetching TOML from: ${tomlUrl}`);
            
            const response = await fetch(tomlUrl);
            
            if (!response.ok) {
                console.log(`Failed to fetch TOML: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to fetch TOML: ${response.status} ${response.statusText}`);
            }
            
            const tomlText = await response.text();
            console.log(`TOML text received (${tomlText.length} bytes)`);
            
            // Save the raw text before parsing to display in message
            const parsedToml = toml.parse(tomlText);
            parsedToml._rawText = tomlText;
            
            return parsedToml;
        } catch (error) {
            console.error('Error fetching or parsing TOML:', error);
            return null;
        }
    }

    // Add utility function to decode and analyze domains in one step
    decodeAndCleanDomain(rawDomain) {
        if (!rawDomain) return { cleanDomain: '', isFirstLedgerDomain: false };
        
        let decoded = rawDomain;
        let isHexEncoded = false;
        
        // Check if domain is in hex format, and if so, decode it
        if (/^[0-9A-F]+$/i.test(rawDomain)) {
            try {
                decoded = Buffer.from(rawDomain, 'hex').toString('utf8').toLowerCase();
                console.log(`Decoded hex domain from ${rawDomain} to: ${decoded}`);
                isHexEncoded = true;
            } catch (error) {
                console.error(`Error decoding hex domain:`, error.message);
                decoded = rawDomain;
            }
        }
        
        // Clean the domain string - remove http/https and trailing slashes
        const cleanDomain = decoded.replace(/^https?:\/\//, '').replace(/\/$/, '');
        
        // Check if this is a FirstLedger domain
        const isFirstLedgerDomain = 
            cleanDomain.includes('firstledger.net') || 
            cleanDomain.endsWith('.toml.firstledger.net') || 
            cleanDomain.includes('fl.firstledger');
        
        if (isFirstLedgerDomain) {
            console.log(`🔍 DETECTED FIRSTLEDGER DOMAIN PATTERN: ${cleanDomain}`);
        }
        
        return { 
            cleanDomain, 
            isFirstLedgerDomain, 
            isHexEncoded 
        };
    }

    // Add function to check if a token has asfRequireAuth enabled
    async checkForAntiSnipe(issuer, transactions) {
        try {
            console.log(`ANTI-SNIPE CHECK: Checking if ${issuer} has asfRequireAuth enabled...`);
            
            // Fast method: Check directly from account info
            console.log(`ANTI-SNIPE CHECK: Fetching account info to check flags directly...`);
            const accountInfo = await this.fetchAccountInfo(issuer);
            
            if (accountInfo && accountInfo.Flags) {
                // asfRequireAuth is flag 2 (bit value 2)
                const hasRequireAuth = (accountInfo.Flags & 2) === 2;
                if (hasRequireAuth) {
                    console.log(`ANTI-SNIPE CHECK: ✅ Found asfRequireAuth in account flags`);
                    return true;
                }
            }
            
            // If no flags found in account info, check transactions if provided
            if (transactions && transactions.length > 0) {
                console.log(`ANTI-SNIPE CHECK: Scanning ${transactions.length} transactions for AccountSet with asfRequireAuth...`);
                
                // Look for AccountSet transactions with asfRequireAuth flag (1)
                for (const txn of transactions) {
                    try {
                        // Look for AccountSet transactions
                        if (txn.TransactionType !== 'AccountSet') continue;
                        
                        // Check for successful transaction
                        if (txn.meta && txn.meta.TransactionResult !== 'tesSUCCESS') continue;
                        if (txn.engine_result && txn.engine_result !== 'tesSUCCESS') continue;
                        if (txn.status === 'failed' || txn.status === 'FAILED') continue;
                        
                        // Check for SetFlag field with value 2 (asfRequireAuth)
                        if (txn.SetFlag === 2) {
                            console.log(`ANTI-SNIPE CHECK: ✅ Found asfRequireAuth flag enabled in tx: ${txn.hash}`);
                            return true;
                        }
                        
                        // Check Flags field that includes asfRequireAuth bit (2)
                        if (txn.Flags) {
                            // asfRequireAuth is flag 2 (bit value 2)
                            const hasRequireAuth = (txn.Flags & 2) === 2;
                            if (hasRequireAuth) {
                                console.log(`ANTI-SNIPE CHECK: ✅ Found asfRequireAuth in Flags field in tx: ${txn.hash}`);
                                return true;
                            }
                        }
                    } catch (txError) {
                        console.error(`ANTI-SNIPE CHECK: Error processing transaction ${txn.hash}:`, txError);
                        // Continue to next transaction
                    }
                }
            } else if (!transactions) {
                // If no transactions provided and not found in account info, fetch a small number to check
                console.log(`ANTI-SNIPE CHECK: No transactions provided, fetching a limited set for ${issuer}...`);
                const limitedTransactions = await this.fetchAccountTransactions(issuer);
                
                if (limitedTransactions && limitedTransactions.length > 0) {
                    // Look only for AccountSet transactions
                    const accountSetTxs = limitedTransactions.filter(tx => tx.TransactionType === 'AccountSet');
                    
                    if (accountSetTxs.length > 0) {
                        console.log(`ANTI-SNIPE CHECK: Found ${accountSetTxs.length} AccountSet transactions to check`);
                        
                        for (const txn of accountSetTxs) {
                            // Check for SetFlag field with value 2 (asfRequireAuth)
                            if (txn.SetFlag === 2) {
                                console.log(`ANTI-SNIPE CHECK: ✅ Found asfRequireAuth flag enabled in tx: ${txn.hash}`);
                                return true;
                            }
                            
                            // Check Flags field that includes asfRequireAuth bit (2)
                            if (txn.Flags) {
                                const hasRequireAuth = (txn.Flags & 2) === 2;
                                if (hasRequireAuth) {
                                    console.log(`ANTI-SNIPE CHECK: ✅ Found asfRequireAuth in Flags field in tx: ${txn.hash}`);
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            
            console.log(`ANTI-SNIPE CHECK: No asfRequireAuth found for ${issuer}`);
            return false;
        } catch (error) {
            console.error('ANTI-SNIPE CHECK: Error checking for anti-snipe:', error);
            return false;
        }
    }

    // Add function to detect XPMarket token issuance pattern
    async isXPMarketTokenIssuance(issuer) {
        try {
            console.log(`XMAGNETIC CHECK: Analyzing if ${issuer} is an XMagnetic token...`);
            
            // Get the account transactions to check for activation pattern
            console.log(`XMAGNETIC CHECK: Fetching transactions for issuer account: ${issuer}`);
            const transactions = await this.fetchAccountTransactions(issuer);
            
            if (!transactions || transactions.length === 0) {
                console.log(`XMAGNETIC CHECK: No transactions found for issuer: ${issuer}`);
                return false;
            }
            
            console.log(`XMAGNETIC CHECK: Retrieved ${transactions.length} transactions for analysis`);
            
            // Define XMagnetic address
            const XMAGNETIC_ADDRESS = 'rGeaXk8Hgh9qA3aQYj9MACMwqzUdB38DH6';
            const XMAGNETIC_SOURCE_TAG = '20221212';
            
            // Look for XMagnetic activation pattern
            let hasInitialPayment = false;
            let hasSettings = false;
            let hasTrustline = false;
            let hasTokenIssuance = false;
            
            // Process each transaction
            for (const txn of transactions) {
                try {
                    // Check for initial 4 XRP payment from XMagnetic
                    if (txn.TransactionType === 'Payment' && 
                        txn.Account === XMAGNETIC_ADDRESS && 
                        typeof txn.Amount === 'string' && 
                        parseFloat(txn.Amount) / 1000000 === 4.0 &&
                        txn.SourceTag === parseInt(XMAGNETIC_SOURCE_TAG)) {
                        
                        console.log(`XMAGNETIC CHECK: Found initial 4 XRP payment with source tag ${XMAGNETIC_SOURCE_TAG}`);
                        hasInitialPayment = true;
                    }
                    
                    // Check for AccountSet (settings change)
                    if (txn.TransactionType === 'AccountSet') {
                        console.log(`XMAGNETIC CHECK: Found AccountSet transaction`);
                        hasSettings = true;
                    }
                    
                    // Check for TrustSet (trustline)
                    if (txn.TransactionType === 'TrustSet' && txn.Account === XMAGNETIC_ADDRESS) {
                        console.log(`XMAGNETIC CHECK: Found TrustSet from XMagnetic`);
                        hasTrustline = true;
                    }
                    
                    // Check for token issuance back to XMagnetic
                    if (txn.TransactionType === 'Payment' && 
                        txn.Account === issuer && 
                        txn.Destination === XMAGNETIC_ADDRESS &&
                        txn.Amount && typeof txn.Amount !== 'string') {
                        
                        console.log(`XMAGNETIC CHECK: Found token issuance back to XMagnetic`);
                        hasTokenIssuance = true;
                    }
                    
                    // Once we've found all pattern elements, we can stop
                    if (hasInitialPayment && hasSettings && hasTrustline && hasTokenIssuance) {
                        break;
                    }
                    
                } catch (txError) {
                    console.error(`XMAGNETIC CHECK: Error processing transaction ${txn.hash}:`, txError);
                    // Continue to next transaction
                }
            }
            
            // Check if we found all pattern elements
            const isXMagnetic = hasInitialPayment && hasSettings && hasTrustline && hasTokenIssuance;
            
            console.log(`XMAGNETIC CHECK: Token ${issuer} isXMagnetic = ${isXMagnetic}`);
            console.log(`XMAGNETIC CHECK: Pattern elements: initialPayment=${hasInitialPayment}, settings=${hasSettings}, trustline=${hasTrustline}, tokenIssuance=${hasTokenIssuance}`);
            
            return isXMagnetic;
            
        } catch (error) {
            console.error('XMAGNETIC CHECK: Error checking for XMagnetic token:', error);
            return false;
        }
    }

    // Function to send XMagnetic token notification (renamed from XPMarket)
    async sendXMagneticTokenNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const issuer = tx.Amount?.issuer;
            const currency = tx.Amount?.currency;
            
            // Get domain information
            const issuerDomain = await this.getIssuerDomain(issuer);
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`XMagnetic token: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            console.log(`Preparing XMagnetic token notification for ${tokenName}`);
            const xMagneticMessage = `
🔴 XMAGNETIC TOKEN 🔴
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

💹 XMAGNETIC INFO 💹
• XMagnetic verified token
• Created via XMagnetic platform

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://xmagnetic.org/memepad/token/${tokenName}+${issuer}?network=mainnet">XMagnetic</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send XMagnetic message to all active chats
            console.log(`Sending XMagnetic notification for ${tx.hash}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, xMagneticMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent XMagnetic notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending XMagnetic message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending XMagnetic notification:', error);
        }
    }

    // Add function to detect XMagnetic token issuance pattern
    async isXMagneticTokenIssuance(issuer) {
        try {
            console.log(`XMAGNETIC CHECK: Analyzing if ${issuer} is an XMagnetic token...`);
            
            // Get the account transactions to check for activation pattern
            console.log(`XMAGNETIC CHECK: Fetching transactions for issuer account: ${issuer}`);
            const transactions = await this.fetchAccountTransactions(issuer);
            
            if (!transactions || transactions.length === 0) {
                console.log(`XMAGNETIC CHECK: No transactions found for issuer: ${issuer}`);
                return false;
            }
            
            console.log(`XMAGNETIC CHECK: Retrieved ${transactions.length} transactions for analysis`);
            
            // Define XMagnetic address
            const XMAGNETIC_ADDRESS = 'rGeaXk8Hgh9qA3aQYj9MACMwqzUdB38DH6';
            // Use number instead of string for destination tag
            const XMAGNETIC_DESTINATION_TAG = 1;
            
            // Look for XMagnetic activation pattern
            let hasInitialPayment = false;
            let hasDisallowXRPSetting = false;
            let hasZeroPayment = false;
            let hasTrustlines = false;
            let hasTokenIssuance = false;
            let tokenCurrency = '';
            
            // First, check for direct interactions with XMagnetic addresses
            for (const txn of transactions) {
                try {
                    // Check for any transaction to/from XMagnetic addresses
                    if (XMAGNETIC_ADDRESSES.includes(txn.Account) || 
                        (txn.Destination && XMAGNETIC_ADDRESSES.includes(txn.Destination))) {
                        console.log(`XMAGNETIC CHECK: Found direct interaction with XMagnetic address in tx: ${txn.hash}`);
                        hasXMagneticInteraction = true;
                        break;
                    }
                } catch (txError) {
                    console.error(`XMAGNETIC CHECK: Error checking XMagnetic interaction in transaction ${txn.hash}:`, txError);
                }
            }
            
            // If we found direct interaction, that's a strong signal
            if (hasXMagneticInteraction) {
                console.log(`XMAGNETIC CHECK: Direct XMagnetic interaction found for ${issuer}`);
                
                // Process each transaction for additional pattern elements
                for (const txn of transactions) {
                    try {
                        // Check for initial ~1.01 XRP payment from XMagnetic - more flexible check
                        if (txn.TransactionType === 'Payment' && 
                            XMAGNETIC_ADDRESSES.includes(txn.Account) && 
                            typeof txn.Amount === 'string' && 
                            parseFloat(txn.Amount) / 1000000 >= 0.9 &&
                            parseFloat(txn.Amount) / 1000000 <= 1.5) {
                            
                            // Make the destination tag check optional
                            if (txn.DestinationTag) {
                                console.log(`XMAGNETIC CHECK: Found initial payment with destination tag ${txn.DestinationTag}`);
                            } else {
                                console.log(`XMAGNETIC CHECK: Found initial payment without destination tag`);
                            }
                            hasInitialPayment = true;
                        }
                        
                        // Check for AccountSet with disallowXRP flag
                        if (txn.TransactionType === 'AccountSet' && 
                            (txn.SetFlag === 3 || (txn.Flags && (txn.Flags & 8) === 8))) {
                            console.log(`XMAGNETIC CHECK: Found AccountSet transaction with disallowXRP`);
                            hasDisallowXRPSetting = true;
                        }
                        
                        // Check for zero XRP payment to another address
                        if (txn.TransactionType === 'Payment' && 
                            txn.Account === issuer && 
                            typeof txn.Amount === 'string' && 
                            parseFloat(txn.Amount) === 0) {
                            
                            console.log(`XMAGNETIC CHECK: Found zero XRP payment`);
                            hasZeroPayment = true;
                        }
                        
                        // Check for at least one TrustSet 
                        if (txn.TransactionType === 'TrustSet') {
                            console.log(`XMAGNETIC CHECK: Found TrustSet transaction`);
                            hasTrustlines = true;
                            
                            // Extract token currency for later use
                            if (txn.LimitAmount && txn.LimitAmount.currency) {
                                tokenCurrency = txn.LimitAmount.currency;
                            }
                        }
                        
                        // Check for token issuance (added check)
                        if (txn.TransactionType === 'Payment' &&
                            txn.Account === issuer &&
                            txn.Amount && 
                            typeof txn.Amount !== 'string' &&
                            txn.Amount.currency) {
                            
                            console.log(`XMAGNETIC CHECK: Found token issuance Payment`);
                            hasTokenIssuance = true;
                        }
                    } catch (txError) {
                        console.error(`XMAGNETIC CHECK: Error processing transaction ${txn.hash}:`, txError);
                        // Continue to next transaction
                    }
                }
                
                // With direct XMagnetic interaction, need at least one more pattern element
                const isXMagnetic = hasXMagneticInteraction && (hasInitialPayment || hasDisallowXRPSetting || hasTokenIssuance || hasTrustlines);
                
                console.log(`XMAGNETIC CHECK: Token ${issuer} isXMagnetic = ${isXMagnetic}`);
                console.log(`XMAGNETIC CHECK: Pattern elements: XMagneticInteraction=${hasXMagneticInteraction}, initialPayment=${hasInitialPayment}, disallowXRP=${hasDisallowXRPSetting}, zeroPayment=${hasZeroPayment}, trustlines=${hasTrustlines}, tokenIssuance=${hasTokenIssuance}`);
                
                return isXMagnetic;
            } else {
                // Fall back to original pattern check logic
                // Process each transaction
                for (const txn of transactions) {
                    try {
                        // Check for initial ~1.01 XRP payment from XMagnetic - more flexible check
                        if (txn.TransactionType === 'Payment' && 
                            txn.Account === XMAGNETIC_ADDRESS && 
                            typeof txn.Amount === 'string' && 
                            parseFloat(txn.Amount) / 1000000 >= 1.0 &&
                            parseFloat(txn.Amount) / 1000000 <= 1.02) {
                            
                            // Make the destination tag check optional
                            if (txn.DestinationTag) {
                                console.log(`XMAGNETIC CHECK: Found initial ~1.01 XRP payment with destination tag ${txn.DestinationTag}`);
                            } else {
                                console.log(`XMAGNETIC CHECK: Found initial ~1.01 XRP payment without destination tag`);
                            }
                            hasInitialPayment = true;
                        }
                        
                        // Check for AccountSet with disallowXRP flag
                        if (txn.TransactionType === 'AccountSet' && 
                            (txn.SetFlag === 3 || (txn.Flags && (txn.Flags & 8) === 8))) {
                            console.log(`XMAGNETIC CHECK: Found AccountSet transaction with disallowXRP`);
                            hasDisallowXRPSetting = true;
                        }
                        
                        // Check for zero XRP payment to another address
                        if (txn.TransactionType === 'Payment' && 
                            txn.Account === issuer && 
                            typeof txn.Amount === 'string' && 
                            parseFloat(txn.Amount) === 0) {
                            
                            console.log(`XMAGNETIC CHECK: Found zero XRP payment`);
                            hasZeroPayment = true;
                        }
                        
                        // Check for at least one TrustSet 
                        if (txn.TransactionType === 'TrustSet') {
                            console.log(`XMAGNETIC CHECK: Found TrustSet transaction`);
                            hasTrustlines = true;
                            
                            // Extract token currency for later use
                            if (txn.LimitAmount && txn.LimitAmount.currency) {
                                tokenCurrency = txn.LimitAmount.currency;
                            }
                        }
                        
                        // Check for token issuance (added check)
                        if (txn.TransactionType === 'Payment' &&
                            txn.Account === issuer &&
                            txn.Amount && 
                            typeof txn.Amount !== 'string' &&
                            txn.Amount.currency) {
                            
                            console.log(`XMAGNETIC CHECK: Found token issuance Payment`);
                            hasTokenIssuance = true;
                        }
                        
                        // Once we've found enough pattern elements, we can stop
                        if ((hasInitialPayment && hasDisallowXRPSetting && hasZeroPayment) ||
                            (hasInitialPayment && hasDisallowXRPSetting && hasTrustlines) ||
                            (hasInitialPayment && hasDisallowXRPSetting && hasTokenIssuance)) {
                            break;
                        }
                        
                    } catch (txError) {
                        console.error(`XMAGNETIC CHECK: Error processing transaction ${txn.hash}:`, txError);
                        // Continue to next transaction
                    }
                }
                
                // Check if we found enough pattern elements (now more flexible)
                // Strong signal: Initial payment from XMagnetic + disallowXRP setting
                const hasStrongSignal = hasInitialPayment && hasDisallowXRPSetting;
                
                // Need at least strong signal plus one more pattern element
                const isXMagnetic = hasStrongSignal && (hasZeroPayment || hasTrustlines || hasTokenIssuance);
                
                console.log(`XMAGNETIC CHECK: Token ${issuer} isXMagnetic = ${isXMagnetic}`);
                console.log(`XMAGNETIC CHECK: Pattern elements: initialPayment=${hasInitialPayment}, disallowXRP=${hasDisallowXRPSetting}, zeroPayment=${hasZeroPayment}, trustlines=${hasTrustlines}, tokenIssuance=${hasTokenIssuance}`);
                
                return isXMagnetic;
            }
            
        } catch (error) {
            console.error('XMAGNETIC CHECK: Error checking for XMagnetic token:', error);
            return false;
        }
    }

    // Function to send XMagnetic token notification
    async sendXMagneticTokenNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const issuer = tx.Amount?.issuer;
            const currency = tx.Amount?.currency;
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`XMagnetic token: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            console.log(`Preparing XMagnetic token notification for ${tokenName}`);
            const xMagneticMessage = `
🔴 XMAGNETIC TOKEN 🔴
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

💹 XMAGNETIC INFO 💹
• XMagnetic verified token
• Created via XMagnetic platform

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://xmagnetic.org/memepad/token/${tokenName}+${issuer}?network=mainnet">XMagnetic</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send XMagnetic message to all active chats
            console.log(`Sending XMagnetic notification for ${tx.hash}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, xMagneticMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent XMagnetic notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending XMagnetic message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending XMagnetic notification:', error);
        }
    }

    // Add function to detect XPMarket token issuance pattern (CORRECT XPMarket detection)
    async isRealXPMarketToken(issuer) {
        try {
            console.log(`REAL XPMARKET CHECK: Analyzing if ${issuer} is an XPMarket token...`);
            
            // Get the account transactions to check for activation pattern
            console.log(`REAL XPMARKET CHECK: Fetching transactions for issuer account: ${issuer}`);
            const transactions = await this.fetchAccountTransactions(issuer);
            
            if (!transactions || transactions.length === 0) {
                console.log(`REAL XPMARKET CHECK: No transactions found for issuer: ${issuer}`);
                return false;
            }
            
            console.log(`REAL XPMARKET CHECK: Retrieved ${transactions.length} transactions for analysis`);
            
            // Define XPMarket address - ONLY the correct one
            const XPMARKET_ADDRESS = 'rXPMxDRxMM6JLk8AMVh569iap3TtnjaF3';
            const XPMARKET_SOURCE_TAG = '20221212';
            
            // Check for interactions with real XPMarket address
            for (const txn of transactions) {
                try {
                    // Check for initial XRP payment from XPMarket with source tag
                    if (txn.TransactionType === 'Payment' && 
                        txn.Account === XPMARKET_ADDRESS && 
                        typeof txn.Amount === 'string' && 
                        txn.SourceTag === parseInt(XPMARKET_SOURCE_TAG)) {
                        
                        console.log(`REAL XPMARKET CHECK: Found payment from XPMarket address with source tag ${XPMARKET_SOURCE_TAG}`);
                        return true;
                    }
                    
                    // Check for any interaction with XPMarket address
                    if ((txn.Account === XPMARKET_ADDRESS) || 
                        (txn.Destination && txn.Destination === XPMARKET_ADDRESS)) {
                        
                        console.log(`REAL XPMARKET CHECK: Found direct interaction with XPMarket address`);
                        return true;
                    }
                } catch (txError) {
                    console.error(`REAL XPMARKET CHECK: Error processing transaction ${txn.hash}:`, txError);
                }
            }
            
            console.log(`REAL XPMARKET CHECK: No XPMarket pattern found for ${issuer}`);
            return false;
            
        } catch (error) {
            console.error('REAL XPMARKET CHECK: Error checking for XPMarket token:', error);
            return false;
        }
    }

    // Function to send XPMarket token notification
    async sendRealXPMarketNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const issuer = tx.Amount?.issuer;
            const currency = tx.Amount?.currency;
            
            // Get domain information
            const issuerDomain = await this.getIssuerDomain(issuer);
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`XPMarket token: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            console.log(`Preparing XPMarket token notification for ${tokenName}`);
            const xpMarketMessage = `
🔶 XPMARKET TOKEN 🔶
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}

💹 XPMARKET INFO 💹
• XPMarket verified token
• Created via XPMarket platform

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://xpmarket.com/dex/${tokenName}-${issuer}/XRP?trade=market">XPMarket</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send XPMarket message to all active chats
            console.log(`Sending XPMarket notification for ${tx.hash}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, xpMarketMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent XPMarket notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending XPMarket message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending XPMarket notification:', error);
        }
    }

    // Helper function to extract memo from transaction
    extractMemoFromTx(tx) {
        try {
            if (!tx || !tx.Memos || !Array.isArray(tx.Memos) || tx.Memos.length === 0) {
                return null;
            }
            
            for (const memoObj of tx.Memos) {
                if (memoObj.Memo && memoObj.Memo.MemoData) {
                    try {
                        // Convert hex memo data to string
                        const memoHex = memoObj.Memo.MemoData;
                        const memoText = Buffer.from(memoHex, 'hex').toString('utf8');
                        return memoText;
                    } catch (error) {
                        console.error('Error decoding memo data:', error);
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting memo from transaction:', error);
            return null;
        }
    }
    
    // Check if token is from Horizon by analyzing transaction memos
    async isHorizonToken(issuer) {
        try {
            console.log(`HORIZON CHECK: Analyzing if ${issuer} is a Horizon token...`);
            
            // First, check the domain without fetching transactions
            const domain = await this.getIssuerDomain(issuer);
            if (domain && domain.includes('horizonxrpl.com')) {
                console.log(`HORIZON CHECK: Found horizonxrpl.com domain for ${issuer} - confirming as Horizon token`);
                return true;
            }
            
            // If no horizon domain, check a limited number of transactions (only if needed)
            console.log(`HORIZON CHECK: No horizon domain found, checking for horizon memos...`);
            
            // Get up to 10 transactions (reduced from previous amount)
            const transactions = await this.fetchAccountTransactions(issuer);
            
            if (!transactions || transactions.length === 0) {
                console.log(`HORIZON CHECK: No transactions found for issuer: ${issuer}`);
                return false;
            }
            
            // Only examine the first 10 transactions to reduce API load
            const limitedTransactions = transactions.slice(0, 10);
            console.log(`HORIZON CHECK: Examining ${limitedTransactions.length} transactions for Horizon memos`);
            
            let horizonMemoCount = 0;
            for (const txn of limitedTransactions) {
                try {
                    // Extract memo
                    const memo = this.extractMemoFromTx(txn);
                    
                    if (memo && (
                        memo.includes('horizonxrpl.com') || 
                        memo.includes('horizon.xrpl') ||
                        memo.toLowerCase().includes('horizon')
                    )) {
                        horizonMemoCount++;
                        console.log(`HORIZON CHECK: Found Horizon memo: ${memo} in tx: ${txn.hash}`);
                        
                        // Short-circuit after finding 2 memos to minimize API calls
                        if (horizonMemoCount >= 2) {
                            break;
                        }
                    }
                } catch (txError) {
                    console.error(`HORIZON CHECK: Error processing transaction ${txn.hash}:`, txError);
                }
            }
            
            // Consider it a Horizon token if we find at least 2 transactions with Horizon memos
            const isHorizon = horizonMemoCount >= 2;
            console.log(`HORIZON CHECK: Token ${issuer} isHorizon = ${isHorizon} (found ${horizonMemoCount} Horizon memos)`);
            
            return isHorizon;
        } catch (error) {
            console.error('HORIZON CHECK: Error checking for Horizon token:', error);
            return false;
        }
    }
    
    // Function to send Horizon token notification
    async sendHorizonTokenNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const issuer = tx.Amount?.issuer;
            const currency = tx.Amount?.currency;
            
            // Get domain information
            const issuerDomain = await this.getIssuerDomain(issuer);
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`Horizon token: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            // Check blackhole status
            const isBlackholed = await this.checkIfAccountIsBlackholed(issuer);
            
            console.log(`Preparing Horizon token notification for ${tokenName}`);
            const horizonMessage = `
🔵 HORIZON TOKEN 🔵
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}${issuerDomain.includes('.toml.firstledger.net') ? '/.well-known/xrp-ledger.toml' : ''}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}
${isBlackholed ? '• ⚫ <b>Blackholed Account</b> detected' : ''}

💹 HORIZON INFO 💹
• Horizon verified token
• Official horizonxrpl.com issuer
• Identified by transaction memos

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://horizonxrpl.com/asset/${issuer}/${currency}">Horizon XRPL</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send Horizon message to all active chats
            console.log(`Sending Horizon token notification for ${tx.hash}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, horizonMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent Horizon notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending Horizon message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending Horizon notification:', error);
        }
    }

    // Add ledger.meme token detection function after the isHorizonToken function
    async isLedgerMemeToken(issuer) {
        try {
            console.log(`LEDGER.MEME CHECK: Analyzing if ${issuer} is a ledger.meme token...`);
            
            // Get domain information
            const domain = await this.getIssuerDomain(issuer);
            
            // Only accept domains that exactly match the ledger.meme format
            if (domain) {
                const isValid = 
                    domain === "ledger.meme" || 
                    domain.endsWith(".toml.ledger.meme") || 
                    domain.endsWith(".ledger.meme");
                
                if (isValid) {
                    console.log(`LEDGER.MEME CHECK: Found valid ledger.meme domain for ${issuer}: ${domain}`);
                    return true;
                } else {
                    console.log(`LEDGER.MEME CHECK: Domain "${domain}" is not a ledger.meme domain`);
                }
            } else {
                console.log(`LEDGER.MEME CHECK: No domain found for ${issuer}`);
            }
            
            // Remove the URL validation check as it causes false positives
            
            console.log(`LEDGER.MEME CHECK: Token ${issuer} is not a ledger.meme token`);
            return false;
        } catch (error) {
            console.error('LEDGER.MEME CHECK: Error checking for ledger.meme token:', error);
            return false;
        }
    }
    
    // Add ledger.meme notification function after the sendHorizonTokenNotification function
    async sendLedgerMemeTokenNotification(tx) {
        try {
            const tokenName = decodeCurrencyHex(tx.Amount?.currency);
            const issuer = tx.Amount?.issuer;
            const currency = tx.Amount?.currency;
            
            // Get domain information
            const issuerDomain = await this.getIssuerDomain(issuer);
            
            // Check for anti-snipe protection
            const hasAntiSnipe = await this.checkForAntiSnipe(issuer);
            console.log(`Ledger.meme token: Anti-snipe check for ${issuer}: ${hasAntiSnipe ? 'ENABLED' : 'DISABLED'}`);
            
            // Check blackhole status
            const isBlackholed = await this.checkIfAccountIsBlackholed(issuer);
            
            console.log(`Preparing ledger.meme token notification for ${tokenName}`);
            const ledgerMemeMessage = `
🧩 LEDGER.MEME TOKEN 🧩
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

✅ TOKEN DETAILS ✅
• Name: ${tokenName}
• Issuer: <code>${issuer}</code>
• Amount: <code>${tx.Amount.value}</code>
${issuerDomain ? `• Domain: ${issuerDomain}` : ''}
${hasAntiSnipe ? '• 🛡️ <b>ANTI SNIPE PROTECTION</b> enabled' : ''}
${isBlackholed ? '• ⚫ <b>Blackholed Account</b> detected' : ''}

💹 LEDGER.MEME INFO 💹
• ledger.meme verified token
• Official ledger.meme issuer

✅ QUICK ACCESS ✅
• 💠 <b>Trade on</b> <a href="https://dexscreener.com/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}_xrp">DexScreener</a>
• 💠 <b>View on</b> <a href="https://ledger.meme/${issuer}">Ledger.meme</a>
• 💠 <b>Check on</b> <a href="https://xrplexplorer.com/explorer/${issuer}">XRPL Explorer</a>
• 🤖 <b>Trade with bot</b> <a href="https://t.me/VoluXTrading_bot?start=${issuer}-${tokenName}">VoluX Trading Bot</a>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰`;
                
            // Send ledger.meme message to all active chats
            console.log(`Sending ledger.meme token notification for ${tx.hash}`);
            if (this.bot) {
                for (const chatId of this.activeChats) {
                    try {
                        await this.bot.sendMessage(chatId, ledgerMemeMessage, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        console.log(`Successfully sent ledger.meme notification to chat ${chatId}`);
                    } catch (error) {
                        console.error(`Error sending ledger.meme message to chat ${chatId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending ledger.meme notification:', error);
        }
    }
}

// Global tracker instances
let tokenTracker = null;
let dexScreenerTracker = null;

// Add a Set to track active users
const activeUsers = new Set();
// Add a Set to track whitelisted users
const whitelistedUsers = new Set();
// Track if whitelist mode is enabled
let whitelistMode = false;

// Add this near the top with other constants
const PING_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// Add this after the activeUsers Set declaration
let periodicPingInterval = null;

// Update the DB_FILE constant
const DB_FILE = path.join(__dirname, 'users.json');
// Add whitelist file path
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');

// Add these utility functions
async function saveWhitelist() {
    try {
        const whitelistData = {
            users: [...whitelistedUsers],
            enabled: whitelistMode
        };
        await fs.writeFile(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));
        console.log(`Saved ${whitelistedUsers.size} whitelisted users to database`);
    } catch (error) {
        console.error('Error saving whitelist:', error);
    }
}

async function loadWhitelist() {
    try {
        const exists = await fs.access(WHITELIST_FILE).then(() => true).catch(() => false);
        if (!exists) {
            console.log('No existing whitelist file found, creating new one with whitelist mode enabled');
            whitelistMode = true; // Default to whitelist mode enabled
            await saveWhitelist();
            return;
        }

        const data = await fs.readFile(WHITELIST_FILE, 'utf8');
        
        try {
            const whitelistData = JSON.parse(data);
            const users = Array.isArray(whitelistData.users) ? whitelistData.users : [];
            whitelistMode = whitelistData.hasOwnProperty('enabled') ? whitelistData.enabled : true; // Default to true if not specified
            
            // Clear existing set
            whitelistedUsers.clear();
            
            // Add users to whitelist
            users.forEach(userId => whitelistedUsers.add(Number(userId)));
            
            console.log(`Loaded ${whitelistedUsers.size} whitelisted users, whitelist mode: ${whitelistMode ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('Error parsing whitelist data:', error);
            whitelistMode = true; // Default to whitelist mode enabled on error
            await saveWhitelist();
        }
    } catch (error) {
        console.error('Error loading whitelist:', error);
        whitelistMode = true; // Default to whitelist mode enabled on error
        await saveWhitelist();
    }
}

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// Add this validation function
async function validateChatId(chatId) {
    try {
        await bot.getChat(chatId);
        return true;
    } catch (error) {
        return false;
    }
}

// Add this function before loadUsers()
async function sendPeriodicPing() {
    try {
        const validChats = new Set();
        
        // Validate each chat
        for (const chatId of activeUsers) {
            try {
                await bot.getChat(chatId);
                validChats.add(chatId);
            } catch (error) {
                console.log(`Removing invalid chat ${chatId}: ${error.message}`);
                activeUsers.delete(chatId);
            }
        }
        
        // Update activeUsers with only valid chats
        if (validChats.size !== activeUsers.size) {
            activeUsers.clear();
            validChats.forEach(id => activeUsers.add(id));
            await saveUsers();
            console.log(`Updated active users list. Removed ${activeUsers.size - validChats.size} invalid users.`);
        }
        
        // Send ping to valid chats
        for (const chatId of validChats) {
            try {
                await bot.sendMessage(chatId, 
                    `🔔 DegenAlerts Hourly Connection Ping\n` +
                    `✅ Actively monitoring XRPL`,
                    { 
                        parse_mode: 'HTML',
                        disable_web_page_preview: true 
                    }
                );
            } catch (error) {
                if (error.code === 'ETELEGRAM' && error.response?.body?.error_code === 403) {
                    console.log(`User ${chatId} has blocked the bot, removing from active users`);
                    activeUsers.delete(chatId);
                    await saveUsers();
                } else {
                    console.error(`Error sending ping to ${chatId}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error in periodic ping:', error);
    }
}

// Modify the loadUsers function to also load the whitelist
async function loadUsers() {
    try {
        // Load whitelist first
        await loadWhitelist();
        
        const exists = await fs.access(DB_FILE).then(() => true).catch(() => false);
        if (!exists) {
            console.log('No existing users file found, creating new one');
            await saveUsers();
            return;
        }

        const data = await fs.readFile(DB_FILE, 'utf8');
        let users = [];
        
        try {
            const userData = JSON.parse(data);
            users = Array.isArray(userData.users) ? userData.users : [];
            console.log('Loaded user data:', users);
        } catch (error) {
            console.error('Error parsing user data:', error);
            await saveUsers();
            return;
        }

        // Clear existing set
        activeUsers.clear();

        // Validate and add users
        const validUsers = new Set();
        for (const userId of users) {
            const isValid = await validateChatId(userId);
            if (isValid) {
                validUsers.add(Number(userId));
            } else {
                console.log(`Skipping invalid user ID: ${userId}`);
            }
        }

        // Update activeUsers with only valid users
        validUsers.forEach(userId => activeUsers.add(userId));
        
        if (activeUsers.size !== users.length) {
            console.log(`Cleaned up ${users.length - activeUsers.size} invalid users`);
            await saveUsers();
        }

        console.log(`Loaded ${activeUsers.size} valid users`);
        
        // Initialize trackers for valid users
        if (activeUsers.size > 0) {
            console.log('Initializing trackers for existing users...');
            
            if (!tokenTracker) {
                tokenTracker = new XRPLAdvancedTracker(undefined, bot);
            }
            if (!dexScreenerTracker) {
                dexScreenerTracker = new DexScreenerTracker(bot);
            }
            
            for (const chatId of activeUsers) {
                try {
                    console.log(`Auto-starting services for user ${chatId}`);
                    await tokenTracker.initialize(chatId);
                    await dexScreenerTracker.addChat(chatId);
                } catch (error) {
                    console.error(`Error auto-starting for user ${chatId}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
        await saveUsers();
    }
}

// Modify the /start handler to check whitelist
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        // Check if whitelist mode is enabled and user is not whitelisted
        if (whitelistMode && !whitelistedUsers.has(userId) && !isAdmin(userId)) {
            return bot.sendMessage(chatId, '❌ Access denied. This bot is private.\n\n🎭 NFT needed: <a href="https://xrp.cafe/collection/bibi">BIBI Collection</a>\n\nPlease acquire the NFT or contact the administrator for access.', {
                parse_mode: 'HTML',
                disable_web_page_preview: false
            });
        }
        
        if (!activeUsers.has(chatId)) {
            activeUsers.add(chatId);
            
            // If whitelist mode is enabled, also add to whitelist
            if (whitelistMode && !whitelistedUsers.has(userId)) {
                whitelistedUsers.add(userId);
                await saveWhitelist();
            }
            
            await saveUsers(); // Save new user
            
            if (!tokenTracker) {
                tokenTracker = new XRPLAdvancedTracker(undefined, bot);
            }
            if (!dexScreenerTracker) {
                dexScreenerTracker = new DexScreenerTracker(bot);
            }
            
            await tokenTracker.initialize(chatId);
            await dexScreenerTracker.addChat(chatId);
            
            await bot.sendMessage(chatId, '🚀 XRPL and DexScreener Trackers started successfully!\n\n' +
                '📊 Tracking:\n' +
                '• AMM Creation\n' +
                '• Token Boosts\n' +
                '• New Token Profiles');
                
            await sendPeriodicPing();
        } else {
            bot.sendMessage(chatId, 'You are already subscribed to the tracker.');
        }
    } catch (error) {
        console.error('Error starting trackers:', error);
        bot.sendMessage(chatId, '❌ Error starting trackers. Please try again.');
        activeUsers.delete(chatId);
        await saveUsers(); // Save after removing user
    }
});

// Keep original /stop handler
bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        if (activeUsers.has(chatId)) {
            activeUsers.delete(chatId);
            await saveUsers(); // Save after removing user
            if (tokenTracker) {
                tokenTracker.activeChats.delete(chatId);
            }
            if (dexScreenerTracker) {
                dexScreenerTracker.removeChat(chatId);
            }
            bot.sendMessage(chatId, '✅ Tracking stopped for your chat.');
        } else {
            bot.sendMessage(chatId, 'ℹ️ You are not currently tracking.');
        }
    } catch (error) {
        console.error('Error stopping trackers:', error);
        bot.sendMessage(chatId, '❌ Error stopping trackers. Please try again.');
    }
});

// Keep original /status handler
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const status = `📊 Tracker Status:
• XRPL AMM Tracker: ${tokenTracker?.isTracking ? '✅ Running' : '❌ Stopped'}
• DexScreener Tracker: ${dexScreenerTracker ? '✅ Running' : '❌ Stopped'}`;
    
    bot.sendMessage(chatId, status);
});

// Keep original /stats handler
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    
    // If no tracker exists, create a temporary one
    const tracker = tokenTracker || new XRPLAdvancedTracker(undefined, bot);
    
    await tracker.generateTokenRegistrySummary();
    const summaryFile = path.join(__dirname, 'xrpl_token_registry_summary.json');

    try {
        const summary = await fs.readFile(summaryFile, 'utf-8');
        bot.sendMessage(chatId, `Here is the current token summary:\n${summary}`);
    } catch (error) {
        bot.sendMessage(chatId, 'Error fetching stats');
    }
});

// Keep original /shutdown handler
bot.onText(/\/shutdown/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Only allow admins to shut down the bot
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    // Stop tracking if active
    if (tokenTracker && tokenTracker.isTracking) {
        tokenTracker.stopTracking();
    }
    
    bot.sendMessage(chatId, 'Shutting down XRPL Tracker...');
    process.exit(0);
});

// Add admin commands to manage whitelist
bot.onText(/\/whitelist_on/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    whitelistMode = true;
    
    // Add all current active users to whitelist to avoid locking them out
    activeUsers.forEach(id => whitelistedUsers.add(id));
    
    await saveWhitelist();
    
    bot.sendMessage(chatId, '✅ Whitelist mode enabled. Only whitelisted users can now access the bot.\n\nAll existing users have been automatically whitelisted.');
});

// Add new command to initialize whitelist with all existing users
bot.onText(/\/whitelist_init/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    try {
        // Read users from the users.json file
        const data = await fs.readFile(DB_FILE, 'utf8');
        const userData = JSON.parse(data);
        const userIds = Array.isArray(userData.users) ? userData.users : [];
        
        // Add all users to whitelist
        userIds.forEach(id => whitelistedUsers.add(Number(id)));
        
        // Enable whitelist mode
        whitelistMode = true;
        await saveWhitelist();
        
        const message = `✅ Whitelist initialized with ${whitelistedUsers.size} users from database.\n` +
                        `Whitelist mode is now enabled.\n` +
                        `New users will be rejected until you add them with /add_user command.`;
        
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Error initializing whitelist:', error);
        bot.sendMessage(chatId, '❌ Error initializing whitelist. Please try again.');
    }
});

bot.onText(/\/whitelist_off/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    whitelistMode = false;
    await saveWhitelist();
    
    bot.sendMessage(chatId, '✅ Whitelist mode disabled. Anyone can now access the bot.');
});

bot.onText(/\/add_user (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    const userIdToAdd = Number(match[1].trim());
    
    if (isNaN(userIdToAdd)) {
        return bot.sendMessage(chatId, '❌ Invalid user ID. Please provide a numeric Telegram user ID.');
    }
    
    // Add to whitelist
    whitelistedUsers.add(userIdToAdd);
    await saveWhitelist();
    
    // Add to active users too
    activeUsers.add(userIdToAdd);
    await saveUsers();
    
    // Initialize the trackers for this user
    if (tokenTracker) {
        try {
            await tokenTracker.initialize(userIdToAdd);
        } catch (error) {
            console.error(`Error initializing token tracker for ${userIdToAdd}:`, error);
        }
    }
    
    if (dexScreenerTracker) {
        try {
            await dexScreenerTracker.addChat(userIdToAdd);
        } catch (error) {
            console.error(`Error initializing dex tracker for ${userIdToAdd}:`, error);
        }
    }
    
    bot.sendMessage(chatId, `✅ User ${userIdToAdd} has been added to whitelist and active users. They will now receive notifications.`);
});

bot.onText(/\/remove_user (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    const userIdToRemove = Number(match[1].trim());
    
    if (isNaN(userIdToRemove)) {
        return bot.sendMessage(chatId, '❌ Invalid user ID. Please provide a numeric Telegram user ID.');
    }
    
    // Track removal status
    let removedFromWhitelist = false;
    let removedFromActive = false;
    
    // Remove from whitelist if present
    if (whitelistedUsers.has(userIdToRemove)) {
        whitelistedUsers.delete(userIdToRemove);
        removedFromWhitelist = true;
        await saveWhitelist();
    }
    
    // Always try to remove from activeUsers regardless of whitelist status
    if (activeUsers.has(userIdToRemove)) {
        activeUsers.delete(userIdToRemove);
        removedFromActive = true;
        await saveUsers();
        
        // Also remove from trackers
        if (tokenTracker && tokenTracker.activeChats) {
            tokenTracker.activeChats.delete(userIdToRemove);
        }
        if (dexScreenerTracker) {
            dexScreenerTracker.removeChat(userIdToRemove);
        }
    }
    
    // Provide appropriate message based on what was removed
    if (removedFromWhitelist && removedFromActive) {
        bot.sendMessage(chatId, `✅ User ${userIdToRemove} has been removed from whitelist and active users. They will no longer receive pings.`);
    } else if (removedFromWhitelist) {
        bot.sendMessage(chatId, `✅ User ${userIdToRemove} has been removed from whitelist only.`);
    } else if (removedFromActive) {
        bot.sendMessage(chatId, `✅ User ${userIdToRemove} has been removed from active users and will no longer receive pings.`);
    } else {
        bot.sendMessage(chatId, `ℹ️ User ${userIdToRemove} was not found in whitelist or active users.`);
    }
});

bot.onText(/\/whitelist_status/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    const status = `
🔒 Whitelist Status: ${whitelistMode ? 'Enabled' : 'Disabled'}
👥 Whitelisted Users: ${whitelistedUsers.size}
👤 Active Users: ${activeUsers.size}

Use /whitelist_on to enable whitelist mode
Use /whitelist_off to disable whitelist mode
Use /add_user [ID] to add a user to whitelist
Use /remove_user [ID] to remove a user from whitelist
`;
    
    bot.sendMessage(chatId, status);
});

bot.onText(/\/help_admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Only administrators can use this command.');
    }
    
    const adminHelp = `
🔑 Admin Commands:

🔒 Whitelist Management:
/whitelist_init - Initialize whitelist with all existing users from database
/whitelist_on - Enable whitelist mode (only whitelisted users can access)
/whitelist_off - Disable whitelist mode (anyone can access)
/whitelist_status - Check whitelist status and counts
/add_user [ID] - Add a user to the whitelist
/remove_user [ID] - Remove a user from the whitelist

⚙️ Bot Management:
/status - Check if trackers are running
/stats - Get token statistics
/shutdown - Stop the bot
`;
    
    bot.sendMessage(chatId, adminHelp);
});

// Add a cleanup function for graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Cleaning up...');
    if (periodicPingInterval) {
        clearInterval(periodicPingInterval);
    }
    if (networkCheckInterval) {
        clearInterval(networkCheckInterval);
    }
    await bot.stopPolling();
    if (tokenTracker?.isTracking) {
        await tokenTracker.stopTracking();
    }
    if (dexScreenerTracker) {
        await dexScreenerTracker.stop();
    }
    process.exit(0);
});

// Add these new error handlers after the existing polling_error handler
bot.on('error', (error) => {
    console.log('Bot general error:', error);
    // Continue running, don't exit
});

// Add network error recovery
let networkCheckInterval = null;

function startNetworkCheck() {
    if (networkCheckInterval) {
        clearInterval(networkCheckInterval);
    }
    
    networkCheckInterval = setInterval(async () => {
        try {
            // Try to make a simple request to test connectivity
            await axios.get('https://api.telegram.org', { timeout: 5000 });
            
            // If we get here, connection is back
            if (!bot.isPolling()) {
                console.log('Network connection restored, restarting bot...');
                await bot.stopPolling();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await bot.startPolling();
            }
        } catch (error) {
            console.log('Network check failed, waiting for connection...');
        }
    }, 10000); // Check every 10 seconds
}

// Load existing users and start tracking for them
loadUsers().then(() => {
    console.log('Starting bot polling...');
    return bot.startPolling();
}).then(() => {
    console.log('Bot started successfully with existing users');
    
    // Initialize whitelist with existing users if not already set up
    if (whitelistMode && whitelistedUsers.size === 0 && activeUsers.size > 0) {
        console.log('Auto-initializing whitelist with existing users...');
        // Add all active users to whitelist
        activeUsers.forEach(id => whitelistedUsers.add(id));
        saveWhitelist().then(() => {
            console.log(`Whitelist initialized with ${whitelistedUsers.size} users`);
        }).catch(error => {
            console.error('Error saving whitelist:', error);
        });
    }
    
    // Clear any existing interval
    if (periodicPingInterval) {
        clearInterval(periodicPingInterval);
    }
    
    // Start periodic ping immediately then every hour after
    sendPeriodicPing().catch(console.error); // Run immediately
    periodicPingInterval = setInterval(() => {
        sendPeriodicPing().catch(console.error);
    }, PING_INTERVAL);
    
    console.log('Periodic ping scheduled for every hour');
}).catch(console.error);

// Add this new function near the other error handling functions
async function handlePollingConflict() {
    console.log('Detected polling conflict, cleaning up...');
    
    // Force cleanup any existing connections
    if (bot.isPolling()) {
        await bot.stopPolling();
    }
    
    // Wait longer to ensure Telegram's session is cleared
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    try {
        // Try to restart polling with clean state
        await bot.startPolling();
        console.log('Successfully restarted polling after conflict');
    } catch (error) {
        console.error('Failed to restart after conflict:', error);
        // If still failing, start network check
        startNetworkCheck();
    }
}

// Add the enhanced saveUsers function
async function saveUsers() {
    try {
        // Save as an object with a users array instead of direct array
        const userData = {
            users: [...activeUsers]
        };
        await fs.writeFile(DB_FILE, JSON.stringify(userData, null, 2));
        console.log(`Saved ${activeUsers.size} users to database`);
        
        // If whitelist mode is just being enabled, add all active users to whitelist
        if (whitelistMode && whitelistedUsers.size === 0) {
            console.log('Adding all active users to whitelist');
            activeUsers.forEach(userId => whitelistedUsers.add(userId));
            await saveWhitelist();
        }
    } catch (error) {
        console.error('Error saving users:', error);
    }
}

// Add Global Monitoring functionality to detect token launches
const GLOBAL_MONITOR_STATES = {
    DISABLED: 'disabled',
    MONITORING: 'monitoring'
};

// Global monitoring state
const globalMonitoringState = new Map(); // chatId -> global monitoring state object

// Global Monitor keyboard
const globalMonitorKeyboard = {
    reply_markup: {
        keyboard: [
            ['❌ Stop Global Monitor'],
            ['🔍 Debug Payment Format'],
            ['🔙 Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

// Function to start global monitoring
async function startGlobalMonitor(chatId) {
    try {
        if (globalMonitoringState.has(chatId) && globalMonitoringState.get(chatId).active) {
            await bot.sendMessage(chatId, '❌ Global Monitor is already running');
            return;
        }

        // Initialize global monitoring state
        globalMonitoringState.set(chatId, {
            active: true,
            startTime: Date.now(),
            triggerAddresses: ['rJGb4etn9GSwNHYVu7dNMbdiVgzqxaTSUG'],
            triggerAmount: '5000000', // 5 XRP in drops
            processedTxs: new Set(),
            lastLogTime: Date.now(),
            heartbeatInterval: null,
            debugMode: false
        });

        // Connect to the XRPL
        if (tokenTracker && tokenTracker.ws && tokenTracker.ws.readyState === WebSocket.OPEN) {
            // Use existing connection from tokenTracker
            setupGlobalStream(tokenTracker.ws, chatId);
        } else {
            // Create a new tracker if needed
            if (!tokenTracker) {
                tokenTracker = new XRPLAdvancedTracker('wss://s1.ripple.com/', bot);
                await tokenTracker.initialize(chatId);
            }
            setupGlobalStream(tokenTracker.ws, chatId);
        }
        
        // Set up a heartbeat to confirm monitoring is still active
        const heartbeatInterval = setInterval(() => {
            if (globalMonitoringState.has(chatId) && globalMonitoringState.get(chatId).active) {
                console.log(`[Global Monitor Heartbeat] Still active for user ${chatId} - ${new Date().toLocaleTimeString()}`);
            } else {
                clearInterval(heartbeatInterval);
            }
        }, 60000); // Log every minute
        
        // Store the interval ID so we can clear it later
        globalMonitoringState.get(chatId).heartbeatInterval = heartbeatInterval;
        
        // Save state for recovery
        await persistGlobalMonitorState(chatId);

        await bot.sendMessage(chatId, 
            `🌐 Global Monitor activated\n` +
            `👀 Watching for token launch signals (Snipe Started)\n` +
            `⚙️ Settings: 5-10 XRP, Main Wallet\n` +
            `💱 Auto-sell: Disabled`,
            globalMonitorKeyboard
        );
    } catch (error) {
        console.error('Error starting global monitor:', error);
        await bot.sendMessage(chatId, `❌ Error starting Global Monitor: ${error.message}`);
    }
}

// Function to stop global monitoring
async function stopGlobalMonitor(chatId) {
    try {
        if (!globalMonitoringState.has(chatId) || !globalMonitoringState.get(chatId).active) {
            return;
        }
        
        // Clear the heartbeat interval
        const state = globalMonitoringState.get(chatId);
        if (state.heartbeatInterval) {
            clearInterval(state.heartbeatInterval);
            console.log(`[Global Monitor] Heartbeat stopped for user ${chatId}`);
        }
        
        // Mark the monitor as inactive
        state.active = false;
        
        console.log(`[Global Monitor] Stopped for user ${chatId}`);
    } catch (error) {
        console.error('Error stopping global monitor:', error);
    }
}

// Function to persist global monitor state
async function persistGlobalMonitorState(chatId) {
    try {
        if (!globalMonitoringState.has(chatId)) return;
        
        const state = globalMonitoringState.get(chatId);
        
        // Create a clean version of the state for persistence (exclude processedTxs)
        const persistedState = {
            active: state.active,
            startTime: state.startTime,
            triggerAddresses: state.triggerAddresses,
            triggerAmount: state.triggerAmount
        };
        
        const statePath = `global_monitor_${chatId}.json`;
        await fs.writeFile(statePath, JSON.stringify(persistedState, null, 2));
    } catch (error) {
        console.error('Error persisting global monitor state:', error);
    }
}

// Function to set up global transaction stream
async function setupGlobalStream(ws, chatId) {
    try {
        console.log(`Setting up Global Monitor stream for user ${chatId}`);
        
        if (!globalMonitoringState.has(chatId) || !globalMonitoringState.get(chatId).active) {
            console.log(`Global monitoring not active for chat ID: ${chatId}`);
            return;
        }
        
        // Initialize transaction counter for this stream
        if (!globalMonitoringState.get(chatId).transactionCount) {
            globalMonitoringState.get(chatId).transactionCount = 0;
            globalMonitoringState.get(chatId).lastLogTime = Date.now();
        }

        // Add message event handler to the WebSocket
        const originalOnMessage = ws.onmessage;
        ws.onmessage = function(event) {
            // Call the original handler if it exists
            if (originalOnMessage) {
                originalOnMessage.call(ws, event);
            }
            
            // Process the message for global monitoring
            const message = JSON.parse(event.data);
            if (message.type === 'transaction') {
                processGlobalTransaction(message.transaction, chatId);
            }
        };
        
        console.log(`Global Monitor stream setup complete for user ${chatId}`);
        console.log(`Monitoring for: 20 XRP payments to trigger addresses [${globalMonitoringState.get(chatId).triggerAddresses.join(', ')}]`);
    } catch (error) {
        console.error('Error setting up global transaction stream:', error);
    }
}

// Function to process global transactions
async function processGlobalTransaction(tx, chatId) {
    try {
        if (!globalMonitoringState.has(chatId) || !globalMonitoringState.get(chatId).active) {
            return;
        }
        
        const state = globalMonitoringState.get(chatId);
        
        // Get transaction hash safely
        const txHash = tx.hash || '';
        
        // Skip if no valid hash or we've processed this transaction already
        if (!txHash || state.processedTxs.has(txHash)) {
            return;
        }
        
        // Mark this transaction as processed
        state.processedTxs.add(txHash);
        
        // Check if this is a trigger payment (20 XRP to the specific address)
        if (tx.TransactionType === "Payment") {
            // Log payment details for debugging
            const destination = tx.Destination || '';
            
            // Correctly handle different payment amount formats
            let amountField = null;
            let xrpAmount = 0;
            
            // If it's a string, it's XRP in drops
            if (typeof tx.Amount === 'string') {
                try {
                    xrpAmount = parseFloat(dropsToXRP(tx.Amount));
                } catch (error) {
                    console.error('Error parsing XRP amount:', error);
                }
            }
            
            // Check for trigger conditions:
            // 1. Amount is around 20 XRP
            const isTriggerAmount = Math.abs(xrpAmount - 5) < 0.5; // Allow for some variation
            
            // 2. Destination is in our trigger list
            const isTriggerDestination = state.triggerAddresses.includes(destination);
            
            // If both criteria match, we have a token launch signal
            if (isTriggerAmount && isTriggerDestination) {
                console.log(`\n\n🚨 TOKEN LAUNCH SIGNAL DETECTED! 🚨
                    Amount: ${xrpAmount} XRP
                    Destination: ${destination}
                    Sender: ${tx.Account}
                    Hash: ${txHash}
                    Timestamp: ${new Date().toISOString()}
                \n\n`);
                
                // Get potential issuer (sender of the 20 XRP)
                const potentialIssuer = tx.Account;
                
                await bot.sendMessage(chatId,
                    `🚨 Token launch signal detected!\n` +
                    `Potential issuer: ${potentialIssuer}\n` +
                    `Transaction hash: ${txHash}\n` +
                    `Get sniper ready now await FL verification...`
                );
            }
        }
    } catch (error) {
        console.error('Error processing global transaction:', error);
    }
}

// Add bot commands to manage global monitoring
bot.onText(/\/global_monitor/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (whitelistMode && !whitelistedUsers.has(userId)) {
        return bot.sendMessage(chatId, '❌ You are not whitelisted to use this command.');
    }
    
    try {
        await startGlobalMonitor(chatId);
    } catch (error) {
        bot.sendMessage(chatId, `Error starting global monitor: ${error.message}`);
    }
});

bot.onText(/\/stop_global_monitor/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (whitelistMode && !whitelistedUsers.has(userId)) {
        return bot.sendMessage(chatId, '❌ You are not whitelisted to use this command.');
    }
    
    try {
        await stopGlobalMonitor(chatId);
        bot.sendMessage(chatId, '✅ Global monitor stopped');
    } catch (error) {
        bot.sendMessage(chatId, `Error stopping global monitor: ${error.message}`);
    }
});

// Enhance the bot message handler for global monitor commands
const originalMessageHandler = bot.on.bind(bot);
bot.on = function(event, callback) {
    if (event === 'message') {
        const enhancedCallback = (msg) => {
            if (msg.text === '❌ Stop Global Monitor') {
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                
                if (whitelistMode && !whitelistedUsers.has(userId)) {
                    return bot.sendMessage(chatId, '❌ You are not whitelisted to use this command.');
                }
                
                stopGlobalMonitor(chatId)
                    .then(() => bot.sendMessage(chatId, '✅ Global Monitor stopped'))
                    .catch(error => bot.sendMessage(chatId, `Error: ${error.message}`));
                return;
            }
            
            return callback(msg);
        };
        return originalMessageHandler(event, enhancedCallback);
    }
    return originalMessageHandler(event, callback);
};
