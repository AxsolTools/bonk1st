/**
 * AQUA Launchpad - Auth Header Utility
 * 
 * Provides consistent authentication headers for all API calls
 * This ensures every API request includes the required auth info
 */

export interface AuthInfo {
  sessionId: string | null;
  walletAddress: string | null;
  userId?: string | null;
}

/**
 * Get authentication headers for API requests
 * 
 * Required by all protected API endpoints:
 * - x-session-id: User's session identifier
 * - x-wallet-address: Active wallet's public key
 * - x-user-id: User identifier (defaults to sessionId)
 */
export function getAuthHeaders(auth: AuthInfo): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (auth.sessionId) {
    headers['x-session-id'] = auth.sessionId;
  }

  if (auth.walletAddress) {
    headers['x-wallet-address'] = auth.walletAddress;
  }

  // userId defaults to sessionId if not provided
  const userId = auth.userId || auth.sessionId;
  if (userId) {
    headers['x-user-id'] = userId;
  }

  return headers;
}

/**
 * Check if auth info is complete (has all required fields)
 */
export function isAuthComplete(auth: AuthInfo): boolean {
  return !!(auth.sessionId && auth.walletAddress);
}

/**
 * Create a fetch wrapper with auth headers automatically included
 */
export function createAuthenticatedFetch(auth: AuthInfo) {
  return async (url: string, options: RequestInit = {}): Promise<Response> => {
    const authHeaders = getAuthHeaders(auth);
    
    return fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers,
      },
    });
  };
}

