/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import type { AccessToken } from '../types/authentication.js';
import {
  AuthenticationError,
  AuthErrorCode,
} from '../errors/AuthenticationError.js';
import { debugLogger } from '../utils/debugLogger.js';
import { CredentialCache } from './CredentialCache.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Provider for service account authentication
 * Handles token caching and automatic refresh
 */
export class ServiceAccountProvider {
  private readonly auth: GoogleAuth;
  private readonly credentialCache: CredentialCache;

  constructor(
    private readonly serviceAccountPath: string,
    scopes: string[] = ['https://www.googleapis.com/auth/cloud-platform'],
  ) {
    this.auth = new GoogleAuth({
      keyFilename: serviceAccountPath,
      scopes,
    });
    
    debugLogger.debug(`Created ServiceAccountProvider with path: [REDACTED]`);

    // Initialize credential cache with refresh callback
    this.credentialCache = new CredentialCache(
      'ServiceAccountProvider',
      async () => {
        const shouldRetry = (e: unknown) =>
          e instanceof AuthenticationError &&
          e.code === AuthErrorCode.NETWORK_ERROR;

        const fetchToken = async (): Promise<AccessToken> => {
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

            return newToken;
          } catch (error) {
            if (error instanceof AuthenticationError) {
              throw error;
            }

            // Handle specific error types
            if (error instanceof Error) {
              if (
                error.message.includes('ENOENT') ||
                error.message.includes('not found')
              ) {
                throw AuthenticationError.fileNotFound(this.serviceAccountPath);
              }

              if (
                error.message.includes('parse') ||
                error.message.includes('JSON')
              ) {
                throw AuthenticationError.invalidServiceAccountJson(
                  this.serviceAccountPath,
                  error.message,
                );
              }

              // Network errors
              if (
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT')
              ) {
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
        };

        return await retryWithBackoff(fetchToken, {
          shouldRetryOnError: shouldRetry,
        });
      },
    );
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<AccessToken> {
    return await this.credentialCache.getToken();
  }

  /**
   * Clear cached credentials
   */
  clearCredentials(): void {
    this.credentialCache.clearCache();
  }

  /**
   * Check if provider is currently authenticated (has valid cached token)
   */
  isAuthenticated(): boolean {
    return this.credentialCache.isAuthenticated();
  }
}
