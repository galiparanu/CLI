/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialCache } from './CredentialCache.js';
import type { AccessToken } from '../types/authentication.js';

describe('CredentialCache', () => {
  let mockRefreshCallback: ReturnType<typeof vi.fn>;
  let credentialCache: CredentialCache;

  beforeEach(() => {
    mockRefreshCallback = vi.fn();
    credentialCache = new CredentialCache('TestProvider', mockRefreshCallback);
  });

  describe('Token Caching', () => {
    it('should fetch and cache a new token', async () => {
      const mockToken: AccessToken = {
        token: 'test-token-123',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000, // 1 hour from now
      };

      mockRefreshCallback.mockResolvedValueOnce(mockToken);

      const token = await credentialCache.getToken();
      
      expect(token).toEqual(mockToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1);
    });

    it('should return cached token if still valid', async () => {
      const mockToken: AccessToken = {
        token: 'cached-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000, // 1 hour from now
      };

      mockRefreshCallback.mockResolvedValueOnce(mockToken);

      // First call - fetch token
      await credentialCache.getToken();
      
      // Second call - should use cache
      const cachedToken = await credentialCache.getToken();
      
      expect(cachedToken).toEqual(mockToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should handle tokens without expiry (e.g., API keys)', async () => {
      const mockToken: AccessToken = {
        token: 'api-key-token',
        tokenType: 'Bearer',
        expiryTime: undefined, // No expiry
      };

      mockRefreshCallback.mockResolvedValueOnce(mockToken);

      const token = await credentialCache.getToken();
      
      expect(token).toEqual(mockToken);
      expect(credentialCache.isValid()).toBe(true);
      
      // Should always use cached token for non-expiring tokens
      const cachedToken = await credentialCache.getToken();
      expect(cachedToken).toEqual(mockToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Refresh Logic', () => {
    it('should refresh token when less than 5 minutes remaining', async () => {
      const oldToken: AccessToken = {
        token: 'old-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 4 * 60 * 1000, // 4 minutes from now
      };

      const newToken: AccessToken = {
        token: 'new-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000, // 1 hour from now
      };

      mockRefreshCallback
        .mockResolvedValueOnce(oldToken)
        .mockResolvedValueOnce(newToken);

      // First call - get old token
      await credentialCache.getToken();
      
      // Second call - should refresh because < 5 minutes remaining
      const refreshedToken = await credentialCache.getToken();
      
      expect(refreshedToken).toEqual(newToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });

    it('should NOT use token with less than 30 seconds remaining (grace period)', async () => {
      const expiredToken: AccessToken = {
        token: 'expired-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 20 * 1000, // 20 seconds from now
      };

      const newToken: AccessToken = {
        token: 'new-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback
        .mockResolvedValueOnce(expiredToken)
        .mockResolvedValueOnce(newToken);

      await credentialCache.getToken();
      
      // Should immediately refresh
      const refreshedToken = await credentialCache.getToken();
      
      expect(refreshedToken).toEqual(newToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });

    it('should retry once after 1 second on refresh failure', async () => {
      const error = new Error('Network error');
      const successToken: AccessToken = {
        token: 'retry-success-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback
        .mockRejectedValueOnce(error) // First attempt fails
        .mockResolvedValueOnce(successToken); // Retry succeeds

      const token = await credentialCache.getToken();
      
      expect(token).toEqual(successToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });

    it('should throw error and clear cache if retry also fails', async () => {
      const error = new Error('Persistent network error');

      mockRefreshCallback
        .mockRejectedValueOnce(error) // First attempt fails
        .mockRejectedValueOnce(error); // Retry also fails

      await expect(credentialCache.getToken()).rejects.toThrow('Persistent network error');
      
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
      expect(credentialCache.isValid()).toBe(false);
    });
  });

  describe('Concurrent Call Safety', () => {
    it('should handle concurrent calls by reusing pending refresh', async () => {
      const mockToken: AccessToken = {
        token: 'concurrent-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      let resolveCallback: (value: AccessToken) => void;
      const pendingPromise = new Promise<AccessToken>((resolve) => {
        resolveCallback = resolve;
      });

      mockRefreshCallback.mockReturnValueOnce(pendingPromise);

      // Start multiple concurrent calls
      const promise1 = credentialCache.getToken();
      const promise2 = credentialCache.getToken();
      const promise3 = credentialCache.getToken();

      // Resolve the pending refresh
      resolveCallback!(mockToken);

      const [token1, token2, token3] = await Promise.all([promise1, promise2, promise3]);

      expect(token1).toEqual(mockToken);
      expect(token2).toEqual(mockToken);
      expect(token3).toEqual(mockToken);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1); // Only one refresh
    });

    it('should maintain session for 1000+ consecutive requests', async () => {
      const mockToken: AccessToken = {
        token: 'stable-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000, // 1 hour - enough for all requests
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      // Make 1000 consecutive requests
      const requests = Array.from({ length: 1000 }, () => credentialCache.getToken());
      const tokens = await Promise.all(requests);

      // All should return the same cached token
      expect(tokens.every(t => t.token === 'stable-token')).toBe(true);
      
      // Should only refresh once (initial fetch)
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1);
    });

    it('should refresh when needed during long sessions (1000+ requests over time)', async () => {
      let callCount = 0;
      const generateToken = () => {
        callCount++;
        return {
          token: `token-${callCount}`,
          tokenType: 'Bearer' as const,
          expiryTime: Date.now() + 3 * 60 * 1000, // 3 minutes - will need refresh
        };
      };

      mockRefreshCallback.mockImplementation(() => Promise.resolve(generateToken()));

      // First batch of requests
      await Promise.all(Array.from({ length: 500 }, () => credentialCache.getToken()));
      
      expect(mockRefreshCallback).toHaveBeenCalledTimes(1);

      // Force expiry by clearing and getting new token
      credentialCache.clearCache();
      
      // Second batch of requests
      await Promise.all(Array.from({ length: 500 }, () => credentialCache.getToken()));
      
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache when clearCache() is called', async () => {
      const mockToken: AccessToken = {
        token: 'to-be-cleared',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      await credentialCache.getToken();
      expect(credentialCache.isValid()).toBe(true);

      credentialCache.clearCache();
      expect(credentialCache.isValid()).toBe(false);
    });

    it('should fetch new token after cache is cleared', async () => {
      const token1: AccessToken = {
        token: 'first-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      const token2: AccessToken = {
        token: 'second-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback
        .mockResolvedValueOnce(token1)
        .mockResolvedValueOnce(token2);

      const firstToken = await credentialCache.getToken();
      expect(firstToken.token).toBe('first-token');

      credentialCache.clearCache();

      const secondToken = await credentialCache.getToken();
      expect(secondToken.token).toBe('second-token');
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });

    it('should report authenticated status correctly', async () => {
      const mockToken: AccessToken = {
        token: 'auth-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      expect(credentialCache.isAuthenticated()).toBe(false);

      await credentialCache.getToken();
      expect(credentialCache.isAuthenticated()).toBe(true);

      credentialCache.clearCache();
      expect(credentialCache.isAuthenticated()).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    it('should return cached token without refresh', async () => {
      const mockToken: AccessToken = {
        token: 'peek-token',
        tokenType: 'Bearer',
        expiryTime: Date.now() + 3600000,
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      await credentialCache.getToken();
      
      const peekedToken = credentialCache.getCachedToken();
      expect(peekedToken).toEqual(mockToken);
    });

    it('should calculate time until expiry', async () => {
      const expiryTime = Date.now() + 1800000; // 30 minutes
      const mockToken: AccessToken = {
        token: 'expiry-token',
        tokenType: 'Bearer',
        expiryTime,
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      await credentialCache.getToken();
      
      const timeUntilExpiry = credentialCache.getTimeUntilExpiry();
      expect(timeUntilExpiry).toBeDefined();
      expect(timeUntilExpiry!).toBeGreaterThan(1790000); // ~30 minutes
      expect(timeUntilExpiry!).toBeLessThanOrEqual(1800000);
    });

    it('should return undefined time until expiry for tokens without expiry', async () => {
      const mockToken: AccessToken = {
        token: 'no-expiry-token',
        tokenType: 'Bearer',
        expiryTime: undefined,
      };

      mockRefreshCallback.mockResolvedValue(mockToken);

      await credentialCache.getToken();
      
      const timeUntilExpiry = credentialCache.getTimeUntilExpiry();
      expect(timeUntilExpiry).toBeUndefined();
    });
  });
});
