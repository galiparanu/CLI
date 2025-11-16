/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import type { AccessToken } from '../types/authentication.js';
import { AuthenticationError, AuthErrorCode } from '../errors/AuthenticationError.js';
import { debugLogger } from '../utils/debugLogger.js';

const FIVE_MIN_BUFFER_MS = 5 * 60 * 1000;
const THIRTY_SEC_BUFFER_MS = 30 * 1000;

/**
 * Provider for service account authentication
 * Handles token caching and automatic refresh
 */
export class ServiceAccountProvider {
  private readonly auth: GoogleAuth;
  private cachedToken?: AccessToken;
  private tokenExpiryTime?: number;

  constructor(
    private readonly serviceAccountPath: string,
    scopes: string[] = ['https://www.googleapis.com/auth/cloud-platform'],
  ) {
    this.auth = new GoogleAuth({
      keyFilename: serviceAccountPath,
      scopes,
    });
    
    debugLogger.debug(`Created ServiceAccountProvider with path: [REDACTED]`);
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<AccessToken> {
    // Check for valid cached token (with 5-minute buffer)
    if (this.isTokenValid()) {
      debugLogger.debug('Using cached service account token');
      return this.cachedToken!;
    }

    // Clear invalid/expired cache
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;

    debugLogger.debug('Fetching new service account token');
    
    try {
      const client = await this.auth.getClient();
      const accessTokenResponse = await client.getAccessToken();

      if (!accessTokenResponse.token) {
        throw new AuthenticationError(
          AuthErrorCode.INVALID_CREDENTIALS,
          'Failed to get access token from service account',
          [
            'Verify service account key file is valid',
            'Ensure service account has necessary IAM permissions',
            'Check that Vertex AI API is enabled for the project',
          ],
        );
      }

      const newToken: AccessToken = {
        token: accessTokenResponse.token,
        tokenType: 'Bearer',
        expiryTime: client.credentials?.expiry_date ?? undefined,
      };

      // Cache the new token
      if (newToken.expiryTime) {
        this.tokenExpiryTime = newToken.expiryTime;
        this.cachedToken = newToken;
        
        const expiresInMinutes = Math.floor((newToken.expiryTime - Date.now()) / 60000);
        debugLogger.debug(`Service account token cached, expires in ${expiresInMinutes} minutes`);
      }

      return newToken;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('ENOENT') || error.message.includes('not found')) {
          throw AuthenticationError.fileNotFound(this.serviceAccountPath);
        }
        
        if (error.message.includes('parse') || error.message.includes('JSON')) {
          throw AuthenticationError.invalidServiceAccountJson(
            this.serviceAccountPath,
            error.message,
          );
        }

        // Network errors
        if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
          throw AuthenticationError.networkError(error);
        }
      }

      throw new AuthenticationError(
        AuthErrorCode.INVALID_CREDENTIALS,
        'Failed to authenticate with service account',
        [
          'Verify service account key file is valid',
          'Check network connectivity',
          'Ensure service account has necessary permissions',
        ],
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if cached token is valid
   * Token must exist and have at least 5 minutes remaining (or 30 seconds minimum)
   */
  private isTokenValid(): boolean {
    if (!this.cachedToken || !this.tokenExpiryTime) {
      return false;
    }

    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiryTime - now;

    // Never use token with less than 30 seconds remaining
    if (timeUntilExpiry < THIRTY_SEC_BUFFER_MS) {
      debugLogger.debug('Token has less than 30 seconds remaining, forcing refresh');
      return false;
    }

    // Proactively refresh if less than 5 minutes remaining
    if (timeUntilExpiry < FIVE_MIN_BUFFER_MS) {
      debugLogger.debug('Token has less than 5 minutes remaining, will refresh');
      return false;
    }

    return true;
  }

  /**
   * Clear cached credentials
   */
  clearCredentials(): void {
    debugLogger.debug('Clearing service account credentials');
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;
  }

  /**
   * Check if provider is currently authenticated (has valid cached token)
   */
  isAuthenticated(): boolean {
    return this.isTokenValid();
  }
}
