/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessToken } from '../types/authentication.js';
import { AuthenticationError, AuthErrorCode } from '../errors/AuthenticationError.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Provider for API key authentication
 * API keys don't expire, so no token refresh is needed
 */
export class APIKeyProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new AuthenticationError(
        AuthErrorCode.INVALID_CREDENTIALS,
        'API key is empty or invalid',
        [
          'Verify GOOGLE_API_KEY environment variable is set',
          'Ensure the API key is not empty',
          'Check that the API key has not been revoked',
        ],
      );
    }

    this.apiKey = apiKey;
    debugLogger.debug('Created APIKeyProvider with key: [REDACTED]');
  }

  /**
   * Get access token (API key doesn't expire)
   * For API keys, we return a token-like structure for consistency
   */
  async getAccessToken(): Promise<AccessToken> {
    debugLogger.debug('Using API key for authentication');
    
    return {
      token: this.apiKey,
      tokenType: 'Bearer',
      // API keys don't expire, so no expiry time
      expiryTime: undefined,
    };
  }

  /**
   * Clear credentials (no-op for API keys as they're passed directly)
   */
  clearCredentials(): void {
    debugLogger.debug('Clear credentials called on APIKeyProvider (no-op)');
    // API keys don't have cached state to clear
  }

  /**
   * Check if provider is authenticated
   * API keys are always valid unless revoked (which we can't check here)
   */
  isAuthenticated(): boolean {
    return true;
  }

  /**
   * Get the raw API key
   * Used when the API key needs to be passed directly (e.g., for Gemini SDK)
   */
  getApiKey(): string {
    return this.apiKey;
  }
}
