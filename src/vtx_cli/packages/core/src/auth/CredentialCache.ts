/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessToken } from '../types/authentication.js';
import { debugLogger } from '../utils/debugLogger.js';

const FIVE_MIN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const THIRTY_SEC_BUFFER_MS = 30 * 1000; // 30 seconds in milliseconds
const ONE_SEC_MS = 1000; // 1 second in milliseconds

/**
 * Manages credential caching with automatic expiry handling
 * Provides token validation with configurable buffer periods
 */
export class CredentialCache {
  private cachedToken?: AccessToken;
  private tokenExpiryTime?: number;
  private pendingRefresh?: Promise<AccessToken>;
  private refreshAttempts: number = 0;
  private lastRefreshAttempt: number = 0;

  constructor(
    private readonly providerName: string,
    private readonly refreshCallback: () => Promise<AccessToken>,
  ) {
    debugLogger.debug(`Created CredentialCache for provider: ${providerName}`);
  }

  /**
   * Get a valid access token, refreshing if necessary
   * Handles concurrent calls by reusing pending refresh operations
   */
  async getToken(): Promise<AccessToken> {
    // Check for valid cached token (with 5-minute buffer)
    if (this.isValid()) {
      debugLogger.debug(`${this.providerName}: Using cached token`);
      return this.cachedToken!;
    }

    // If a refresh is already in progress, wait for it
    if (this.pendingRefresh) {
      debugLogger.debug(`${this.providerName}: Waiting for pending refresh`);
      return this.pendingRefresh;
    }

    // Start new refresh operation
    this.pendingRefresh = this.refreshToken();
    
    try {
      const token = await this.pendingRefresh;
      return token;
    } finally {
      this.pendingRefresh = undefined;
    }
  }

  /**
   * Refresh the token with retry logic
   * Implements single retry after 1 second on failure
   */
  private async refreshToken(): Promise<AccessToken> {
    debugLogger.debug(`${this.providerName}: Starting token refresh`);
    
    try {
      const token = await this.refreshCallback();
      
      // Cache the new token
      this.cacheToken(token);
      this.refreshAttempts = 0; // Reset on success
      
      return token;
    } catch (error) {
      const now = Date.now();
      const timeSinceLastAttempt = now - this.lastRefreshAttempt;
      this.lastRefreshAttempt = now;

      // Retry once if we haven't recently retried
      if (this.refreshAttempts === 0 || timeSinceLastAttempt > ONE_SEC_MS) {
        this.refreshAttempts++;
        debugLogger.debug(
          `${this.providerName}: Token refresh failed, retrying in 1 second (attempt ${this.refreshAttempts})`,
        );
        
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, ONE_SEC_MS));
        
        try {
          const token = await this.refreshCallback();
          this.cacheToken(token);
          this.refreshAttempts = 0; // Reset on success
          return token;
        } catch (retryError) {
          // Fallback: clear cache and throw error
          debugLogger.debug(
            `${this.providerName}: Token refresh retry failed, clearing cache`,
          );
          this.clearCache();
          throw retryError;
        }
      }

      // If retry attempts exhausted, clear cache and throw
      this.clearCache();
      throw error;
    }
  }

  /**
   * Cache a token with expiry tracking
   */
  private cacheToken(token: AccessToken): void {
    this.cachedToken = token;
    this.tokenExpiryTime = token.expiryTime;

    if (token.expiryTime) {
      const expiresInMinutes = Math.floor((token.expiryTime - Date.now()) / 60000);
      debugLogger.debug(
        `${this.providerName}: Token cached, expires in ${expiresInMinutes} minutes`,
      );
    } else {
      debugLogger.debug(`${this.providerName}: Token cached (no expiry)`);
    }
  }

  /**
   * Check if cached token is valid
   * Returns true if token exists and meets buffer requirements
   * 
   * Validation criteria:
   * - Token must exist
   * - Token must not expire within 30 seconds (grace period)
   * - Token should not expire within 5 minutes (proactive refresh)
   */
  isValid(): boolean {
    if (!this.cachedToken) {
      return false;
    }

    // Tokens without expiry (e.g., API keys) are always valid
    if (!this.tokenExpiryTime) {
      return true;
    }

    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiryTime - now;

    // Never use token with less than 30 seconds remaining (grace period)
    if (timeUntilExpiry < THIRTY_SEC_BUFFER_MS) {
      debugLogger.debug(
        `${this.providerName}: Token has less than 30 seconds remaining, forcing refresh`,
      );
      return false;
    }

    // Proactively refresh if less than 5 minutes remaining
    if (timeUntilExpiry < FIVE_MIN_BUFFER_MS) {
      debugLogger.debug(
        `${this.providerName}: Token has less than 5 minutes remaining, will refresh`,
      );
      return false;
    }

    return true;
  }

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    debugLogger.debug(`${this.providerName}: Clearing credential cache`);
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;
    this.refreshAttempts = 0;
    this.lastRefreshAttempt = 0;
  }

  /**
   * Check if provider is currently authenticated (has valid cached token)
   */
  isAuthenticated(): boolean {
    return this.isValid();
  }

  /**
   * Get cached token without refresh (may be expired)
   * Used for debugging or testing purposes
   */
  getCachedToken(): AccessToken | undefined {
    return this.cachedToken;
  }

  /**
   * Get time until token expiry in milliseconds
   * Returns undefined if no token cached or no expiry set
   */
  getTimeUntilExpiry(): number | undefined {
    if (!this.tokenExpiryTime) {
      return undefined;
    }
    return Math.max(0, this.tokenExpiryTime - Date.now());
  }
}
