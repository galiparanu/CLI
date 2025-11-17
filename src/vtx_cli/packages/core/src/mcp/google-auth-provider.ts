/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { GoogleAuth } from 'google-auth-library';
import type { MCPServerConfig } from '../config/config.js';
import { coreEvents } from '../utils/events.js';
import { CredentialCache } from '../auth/CredentialCache.js';
import type { AccessToken } from '../types/authentication.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  AuthenticationError,
  AuthErrorCode,
} from '../errors/AuthenticationError.js';
import { retryWithBackoff } from '../utils/retry.js';
import { credentialManager } from '../auth/CredentialManager.js';

const ALLOWED_HOSTS = [/^.+\.googleapis\.com$/, /^(.*\.)?luci\.app$/];

export class GoogleCredentialProvider implements OAuthClientProvider {
  private readonly auth: GoogleAuth;
  private readonly credentialCache: CredentialCache;

  // Properties required by OAuthClientProvider, with no-op values
  readonly redirectUrl = '';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Gemini CLI (Google ADC)',
    redirect_uris: [],
    grant_types: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
  };
  private _clientInformation?: OAuthClientInformationFull;

  constructor(private readonly config?: MCPServerConfig) {
    const url = this.config?.url || this.config?.httpUrl;
    if (!url) {
      throw new Error(
        'URL must be provided in the config for Google Credentials provider',
      );
    }

    const hostname = new URL(url).hostname;
    if (!ALLOWED_HOSTS.some((pattern) => pattern.test(hostname))) {
      throw new Error(
        `Host "${hostname}" is not an allowed host for Google Credential provider.`,
      );
    }

    const scopes = this.config?.oauth?.scopes;
    if (!scopes || scopes.length === 0) {
      throw new Error(
        'Scopes must be provided in the oauth config for Google Credentials provider',
      );
    }
    this.auth = new GoogleAuth({
      scopes,
    });

    // Initialize credential cache with refresh callback
    this.credentialCache = new CredentialCache(
      'GoogleCredentialProvider',
      async () => {
        const shouldRetry = (e: Error) =>
          e instanceof AuthenticationError &&
          e.code === AuthErrorCode.NETWORK_ERROR;

        const fetchToken = async (): Promise<AccessToken> => {
          try {
            const client = await this.auth.getClient();
            const accessTokenResponse = await client.getAccessToken();

            if (!accessTokenResponse.token) {
              throw new AuthenticationError(
                AuthErrorCode.INVALID_CREDENTIALS,
                'Failed to get access token from Google ADC',
                [
                  'Run `gcloud auth application-default login`',
                  'Ensure your gcloud user has necessary IAM permissions',
                  'Check that Vertex AI API is enabled for the project',
                ],
              );
            }

            const accessToken: AccessToken = {
              token: accessTokenResponse.token,
              tokenType: 'Bearer',
              expiryTime: client.credentials?.expiry_date ?? undefined,
            };

            return accessToken;
          } catch (error) {
            if (error instanceof AuthenticationError) {
              throw error;
            }

            if (error instanceof Error) {
              if (
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT')
              ) {
                throw AuthenticationError.networkError(error);
              }
            }

            throw new AuthenticationError(
              AuthErrorCode.INVALID_CREDENTIALS,
              'Failed to authenticate with Google ADC',
              [
                'Run `gcloud auth application-default login`',
                'Check network connectivity',
                'Ensure your gcloud user has necessary permissions',
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

    // Register with credential manager for cleanup on exit
    credentialManager.registerProvider(this);
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      const accessToken = await this.credentialCache.getToken();
      
      const oauthTokens: OAuthTokens = {
        access_token: accessToken.token,
        token_type: 'Bearer',
      };

      return oauthTokens;
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Failed to get access token from Google ADC: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      debugLogger.debug('Google ADC token fetch error:', error);
      return undefined;
    }
  }

  saveTokens(_tokens: OAuthTokens): void {
    // No-op, ADC manages tokens.
  }

  redirectToAuthorization(_authorizationUrl: URL): void {
    // No-op
  }

  saveCodeVerifier(_codeVerifier: string): void {
    // No-op
  }

  codeVerifier(): string {
    // No-op
    return '';
  }

  /**
   * Clear cached credentials to force re-authentication
   */
  clearCredentials(): void {
    this.credentialCache.clearCache();
  }

  /**
   * Check if provider is currently authenticated
   */
  isAuthenticated(): boolean {
    return this.credentialCache.isAuthenticated();
  }
}
