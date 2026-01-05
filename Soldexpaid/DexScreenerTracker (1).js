import axios from 'axios';

class DexScreenerTracker {
    constructor(botInstance) {
        this.bot = botInstance;
        this.activeChats = new Set();
        this.processedBoosts = new Set();
        this.processedProfiles = new Set();
        this.checkInterval = 5000;
        this.profileCheckInterval = 10000;
        this.resetInterval = 86400000;

        // Only track Solana (as requested)
        this.TARGET_CHAIN_ID = 'solana';

        this.maxRetries = 3;
        this.retryDelay = 5000;
        this.monitoringIntervals = [];
        this.maxProfilesPerCheck = 20;

        // Initial burst control: only send latest N on first run, mark older as processed
        this.initialized = { boosts: false, profiles: false };
        this.initialSendLimit = 5;
        // Cache for token names to reduce lookups
        this.tokenNameCache = new Map();
        
        this.config = {
            axios: {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                },
                maxRedirects: 5,
                keepAlive: true
            },
            endpoints: {
                boosts: 'https://api.dexscreener.com/token-boosts/latest/v1',
                profiles: 'https://api.dexscreener.com/token-profiles/latest/v1'
            }
        };

        this.axiosInstance = axios.create(this.config.axios);
        this.axiosInstance.interceptors.response.use(undefined, async (err) => {
            const { config } = err;
            if (!config || !config.retry) {
                return Promise.reject(err);
            }
            config.retry -= 1;
            const delayRetry = new Promise(resolve => setTimeout(resolve, this.retryDelay));
            await delayRetry;
            return this.axiosInstance(config);
        });
    }

    async addChat(chatId) {
        this.activeChats.add(chatId);
        if (this.activeChats.size === 1) {
            // Start tracking if this is the first chat
            await this.start();
        }
    }

    removeChat(chatId) {
        this.activeChats.delete(chatId);
        if (this.activeChats.size === 0) {
            // Stop tracking if no chats remain
            this.stop();
        }
    }

    async start() {
        console.log('Starting DexScreener tracker (Solana only)...');
        
        if (this.activeChats.size === 0) {
            console.log('No active chats, waiting for chats to be added before starting checks');
            return;
        }
        
        try {
            // Initial checks
            await this.checkLatestBoosts();
            await this.checkLatestProfiles();
            
            // Set up intervals
            this.monitoringIntervals.push(
                setInterval(async () => {
                    try {
                        await this.checkLatestBoosts();
                    } catch (error) {
                        console.error('Error in boost check interval:', error);
                    }
                }, this.checkInterval)
            );

            this.monitoringIntervals.push(
                setInterval(async () => {
                    try {
                        await this.checkLatestProfiles();
                    } catch (error) {
                        console.error('Error in profile check interval:', error);
                    }
                }, this.profileCheckInterval) // Use longer interval for profiles
            );
            
            // Reset processed Sets daily
            this.monitoringIntervals.push(
                setInterval(() => {
                    console.log('Resetting processed tokens cache...');
                    this.processedBoosts.clear();
                    this.processedProfiles.clear();
                }, this.resetInterval)
            );

            // Add reconnection logic for bot
            if (this.bot) {
                this.bot.on('polling_error', (error) => {
                    console.error('Polling error:', error);
                    setTimeout(() => this.reconnectBot(), this.retryDelay);
                });
            }
        } catch (error) {
            console.error('Error in start:', error);
            this.stop();
            setTimeout(() => this.start(), this.retryDelay);
        }
    }

    stop() {
        // Clear all monitoring intervals
        this.monitoringIntervals.forEach(interval => clearInterval(interval));
        this.monitoringIntervals = [];
        console.log('DexScreener tracker stopped');
    }

    async reconnectBot() {
        try {
            if (this.bot) {
                await this.bot.stopPolling();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.bot.startPolling();
                console.log('Bot reconnected successfully');
            }
        } catch (error) {
            console.error('Error reconnecting bot:', error);
            setTimeout(() => this.reconnectBot(), this.retryDelay);
        }
    }

    async makeRequest(endpoint, retries = this.maxRetries) {
        try {
            const response = await this.axiosInstance.get(endpoint, {
                retry: retries
            });
            return response.data;
        } catch (error) {
            if (retries > 0) {
                console.log(`Retrying request to ${endpoint}, ${retries} attempts left`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.makeRequest(endpoint, retries - 1);
            }
            throw error;
        }
    }

    async checkLatestBoosts() {
        try {
            const data = await this.makeRequest(this.config.endpoints.boosts);
            const boosts = (Array.isArray(data) ? data : [data])
                .filter(b => b?.tokenAddress && b.chainId?.toLowerCase() === this.TARGET_CHAIN_ID);

            // On first run: send only latest N, mark older as processed to prevent spam
            if (!this.initialized.boosts && boosts.length > 0) {
                // Assume array is newest-first (DexScreener returns latest). If not, sort by time if available.
                const toSend = boosts.slice(0, this.initialSendLimit);
                const toSkip = boosts.slice(this.initialSendLimit);
                // Mark skipped as processed
                toSkip.forEach(b => this.processedBoosts.add(`${b.chainId}_${b.tokenAddress}_${b.amount}`));
                this.initialized.boosts = true;
                // Process only the limited set now
                for (const boost of toSend) {
                    try {
                        const boostId = `${boost.chainId}_${boost.tokenAddress}_${boost.amount}`;
                        if (this.processedBoosts.has(boostId)) continue;
                        console.log(`Found new SOLANA boost for token: ${boost.tokenAddress}`);
                        this.processedBoosts.add(boostId);
                        await this.sendBoostNotification(boost);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error('Error processing boost:', error);
                    }
                }
                return;
            }

            for (const boost of boosts) {
                try {
                    const boostId = `${boost.chainId}_${boost.tokenAddress}_${boost.amount}`;
                    if (this.processedBoosts.has(boostId)) continue;

                    console.log(`Found new SOLANA boost for token: ${boost.tokenAddress}`);
                    this.processedBoosts.add(boostId);
                    await this.sendBoostNotification(boost);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Error processing boost:', error);
                }
            }
        } catch (error) {
            console.error('Error checking boosts:', error.message);
        }
    }

    async checkLatestProfiles() {
        try {
            const data = await this.makeRequest(this.config.endpoints.profiles);
            if (!data) return;

            const profiles = (Array.isArray(data) ? data : [data])
                .filter(p => p?.tokenAddress && p.chainId?.toLowerCase() === this.TARGET_CHAIN_ID);

            // On first run: send only latest N, mark older as processed
            if (!this.initialized.profiles && profiles.length > 0) {
                const toSend = profiles.slice(0, this.initialSendLimit);
                const toSkip = profiles.slice(this.initialSendLimit);
                toSkip.forEach(p => this.processedProfiles.add(`${p.chainId}_${p.tokenAddress}`));
                this.initialized.profiles = true;

                for (const profile of toSend) {
                    try {
                        const profileId = `${profile.chainId}_${profile.tokenAddress}`;
                        if (this.processedProfiles.has(profileId)) continue;
                        console.log(`Processing new SOLANA profile for token: ${profile.tokenAddress}`);
                        this.processedProfiles.add(profileId);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.sendProfileNotification(profile);
                    } catch (error) {
                        console.error('Error processing individual profile:', error);
                    }
                }
                return;
            }

            const newProfiles = profiles.filter(profile => 
                !this.processedProfiles.has(`${profile.chainId}_${profile.tokenAddress}`)
            );

            console.log(`Found ${newProfiles.length} new SOLANA profiles to process`);
            for (const profile of newProfiles) {
                try {
                    const profileId = `${profile.chainId}_${profile.tokenAddress}`;
                    console.log(`Processing new SOLANA profile for token: ${profile.tokenAddress}`);
                    this.processedProfiles.add(profileId);
                    await this.sendProfileNotification(profile);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Error processing individual profile:', error);
                }
            }
        } catch (error) {
            console.error('Error checking profiles:', error);
        }
    }

    async sendProfileNotification(profile) {
        // Try to ensure a friendly token name
        const tokenName = await this.getTokenName(profile.tokenAddress, profile.name);

        const message = `
🟣💠 SOLANA TOKEN PROFILE ALERT 💠🟣
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓

✨ TOKEN INFO ✨
• Name: ${tokenName}
• Address: <code>${profile.tokenAddress}</code>
• Network: <b>SOLANA</b>

✨ ABOUT ✨
${profile.description || 'No description available'}

✨ LINKS & RESOURCES ✨
• 💜 <b>View on</b> <a href="${profile.url}">DexScreener</a>
${this.formatProfileLinksHTML(profile.links)}

┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

        await this.broadcastMessage(message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    }

    async sendBoostNotification(boost) {
        // High-visibility SOLANA boost notification
        const tokenName = await this.getTokenName(boost.tokenAddress, boost.name);
        const message = `
 SOLANA TOKEN BOOST DETECTED 🚀
════════════════════════════════

🔋 BOOST METRICS 🔋
• Token: <code>${boost.tokenAddress}</code>${tokenName ? ` (${tokenName})` : ''}
• Amount: ${boost.amount}
• Total: ${boost.totalAmount}
• Network: <b>SOLANA</b>

📝 DESCRIPTION
${boost.description || 'No description available'}

🔗 QUICK LINKS
• <b>View on</b> <a href="${boost.url}">DexScreener</a>
${boost.links ? boost.links.map(link => 
    `• <b>${link.label || link.type}:</b> <a href="${link.url}">${link.label || link.type}</a>`
).join('\n') : ''}

════════════════════════════════`;

        await this.broadcastMessage(message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    }

    formatProfileLinksHTML(links) {
        if (!links || !Array.isArray(links)) return '';
        
        return links.map(link => {
            const platform = link.url.includes('twitter.com') || link.url.includes('x.com') 
                ? '𝕏 Twitter' 
                : link.url.includes('t.me') 
                    ? '📱 Telegram' 
                    : link.type === 'info'
                        ? '🌐 Website'
                        : '🔗 Social';
            return `• 🌟 ${platform}: <a href="${link.url}">${link.title || 'Link'}</a>`;
        }).join('\n');
    }

    // Fetch token name from DexScreener (pairs endpoint) as fallback
    async getTokenName(tokenAddress, providedName) {
        try {
            if (!tokenAddress) return providedName || '';
            // Use cache first
            if (this.tokenNameCache.has(tokenAddress)) {
                return this.tokenNameCache.get(tokenAddress);
            }
            if (providedName && providedName !== 'N/A') {
                this.tokenNameCache.set(tokenAddress, providedName);
                return providedName;
            }
            const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
            const data = await this.makeRequest(url);
            // DexScreener returns { pairs: [...] } with baseToken/name or quoteToken/name
            const name = data?.pairs?.[0]?.baseToken?.name || data?.pairs?.[0]?.quoteToken?.name || '';
            if (name) this.tokenNameCache.set(tokenAddress, name);
            return name || (providedName || 'Unknown');
        } catch (e) {
            return providedName || 'Unknown';
        }
    }

    getEmojiForLinkType(type) {
        const emojiMap = {
            'Twitter': '🐦',
            'Telegram': '📱',
            'Website': '🌍',
            'Discord': '💬',
            'Medium': '📝',
            'Github': '👨‍💻',
            'default': '🔗'
        };
        return emojiMap[type] || emojiMap.default;
    }

    async broadcastMessage(message, options = {}) {
        console.log('Broadcasting message to chats:', Array.from(this.activeChats));
        
        if (this.activeChats.size === 0) {
            console.error('No active chats to broadcast to!');
            return;
        }

        for (const chatId of this.activeChats) {
            try {
                console.log(`Attempting to send message to chat ${chatId}`);
                await this.bot.sendMessage(chatId, message, {
                    ...options,
                    parse_mode: 'HTML', // Use HTML for better formatting
                    disable_web_page_preview: true
                });
                console.log(`Successfully sent message to chat ${chatId}`);
            } catch (error) {
                console.error(`Error sending message to chat ${chatId}:`, error);
                if (error.code === 403) {
                    console.log(`Removing blocked chat ${chatId}`);
                    this.activeChats.delete(chatId);
                }
            }
        }
    }
}

export default DexScreenerTracker; 