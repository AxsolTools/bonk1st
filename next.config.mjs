/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Clean up the URL - remove any trailing colons or duplicate ports
    let diceServerUrl = process.env.DICE_SERVER_URL || 'http://localhost:5001'
    
    // Fix common misconfigurations
    diceServerUrl = diceServerUrl.replace(/:+$/, '') // Remove trailing colons
    diceServerUrl = diceServerUrl.replace(/:(\d+):(\d+)/, ':$1') // Fix double ports
    
    // Skip rewrites if dice server URL is invalid
    if (!diceServerUrl || diceServerUrl.includes('__ESC')) {
      console.warn('[NEXT] Invalid DICE_SERVER_URL, skipping dice rewrites')
      return []
    }
    
    return [
      // Proxy dice game API routes to Express server
      {
        source: '/api/dice/(.*)',
        destination: `${diceServerUrl}/api/dice/$1`,
      },
      // Proxy chat API routes to Express server
      {
        source: '/api/chat/(.*)',
        destination: `${diceServerUrl}/api/chat/$1`,
      },
    ]
  },
}

export default nextConfig
