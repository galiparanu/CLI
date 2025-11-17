/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import { AuthMethodType } from '../AuthMethodType.js';
import type {
  ModelAuthAdapter,
  ModelRequest,
  ModelResponse,
} from '../ModelAuthAdapter.js';
import type { ModelAuthConfig } from '../../services/modelService.js';
import type { AuthResult } from '../AuthResult.js';
import { createSuccessAuthResult, createFailedAuthResult } from '../AuthResult.js';
import { AuthError } from '../AuthError.js';
import { CachedToken } from '../CachedToken.js';

/**
 * Adapter for authenticating to Vertex AI Gemini models via REST API.
 * Supports both API key and bearer token authentication.
 * 
 * Endpoint formats:
 * - API Key: /v1/publishers/google/models/{model}:streamGenerateContent?key={apiKey}
 * - Bearer Token: /v1/projects/{project}/locations/{region}/publishers/google/models/{model}:streamGenerateContent
 * Request format: { "contents": [...], "generationConfig": {...} }
 */
export class VertexAIAdapter implements ModelAuthAdapter {
  private tokenCache: Map<string, CachedToken> = new Map();
  private readonly googleAuth: GoogleAuth;
  private readonly apiKey?: string;

  constructor() {
    // Check for API key in environment first
    this.apiKey = process.env['GOOGLE_API_KEY'];
    
    // Initialize GoogleAuth with API key if available, otherwise use ADC
    // Following Google Cloud best practices: https://cloud.google.com/docs/authentication/api-keys-use#node.js_1
    if (this.apiKey) {
      this.googleAuth = new GoogleAuth({
        apiKey: this.apiKey,
      });
    } else {
      this.googleAuth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
  }

  /**
   * Authenticate using API key (if available) or Google Application Default Credentials.
   * Following Google Cloud best practices: https://cloud.google.com/docs/authentication/api-keys-use#node.js_1
   * @param config Model authentication configuration
   * @returns Authentication result with token or error
   */
  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    const startTime = Date.now();
    try {
      // If API key is available, GoogleAuth will handle it automatically
      // We still need to get a token for consistency with the adapter interface
      if (this.apiKey) {
        // For API key, GoogleAuth will use it automatically in requests
        // We return the API key as the "token" for consistency
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          console.warn(
            `[VertexAIAdapter] API key authentication took ${duration}ms (target: <1000ms) for ${config.modelAlias}`,
          );
        }
        return createSuccessAuthResult(AuthMethodType.BEARER_TOKEN, this.apiKey);
      }

      // Fallback to bearer token authentication (ADC)
      // Validate dependencies (GoogleAuth is always available)
      const depsValid = await this.validateDependencies();
      const duration = Date.now() - startTime;

      if (duration > 5000) {
        console.warn(
          `[VertexAIAdapter] Dependency validation took ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
        );
      }

      if (!depsValid) {
        return createFailedAuthResult(
          AuthMethodType.BEARER_TOKEN,
          AuthError.missingCredentials([
            'Set GOOGLE_API_KEY environment variable for API key authentication',
            'Or run: gcloud auth application-default login for bearer token authentication',
          ]),
        );
      }

      // Get token from ADC
      const token = await this.getToken(config);

      return createSuccessAuthResult(AuthMethodType.BEARER_TOKEN, token);
    } catch (error) {
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(
          `[VertexAIAdapter] Authentication failed after ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
        );
      }
      return createFailedAuthResult(
        AuthMethodType.BEARER_TOKEN,
        this.mapError(error),
      );
    }
  }

  /**
   * Gets a bearer token, using cache if available and valid.
   */
  private async getToken(config: ModelAuthConfig): Promise<string> {
    const cached = this.tokenCache.get(config.modelAlias);
    
    // Check if cached token is still valid and doesn't need refresh
    if (cached && cached.isValid() && !cached.needsRefresh()) {
      return cached.token;
    }

    // Get new token
    try {
      const client = await this.googleAuth.getClient();
      const accessTokenResponse = await client.getAccessToken();

      if (!accessTokenResponse.token) {
        throw AuthError.invalidCredentials([
          'Run: gcloud auth application-default login',
          'Ensure your gcloud user has necessary IAM permissions',
          'Check that Vertex AI API is enabled for the project',
        ]);
      }

      // Calculate expiry time
      // GoogleAuth tokens typically expire in 1 hour, but we use the actual expiry if available
      const expiryDate = client.credentials?.expiry_date;
      const expiresAt = expiryDate
        ? expiryDate
        : Date.now() + 3600000; // Default to 1 hour if not specified

      // Cache the token
      const cachedToken = new CachedToken(
        accessTokenResponse.token,
        expiresAt,
        'Bearer',
      );
      this.tokenCache.set(config.modelAlias, cachedToken);

      return accessTokenResponse.token;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Sends a request to the Vertex AI Gemini endpoint.
   * Uses API key in query parameter (if available) or GoogleAuth for bearer token.
   * Following Google Cloud best practices: https://cloud.google.com/docs/authentication/api-keys-use#node.js_1
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    const config = request.config;
    const endpoint = this.buildEndpoint(config);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };

    // For API key: already in endpoint URL as query parameter
    // For bearer token: use GoogleAuth to get Authorization header
    if (!this.apiKey) {
      const client = await this.googleAuth.getClient();
      const authHeaders = await client.getRequestHeaders();
      if (authHeaders['Authorization']) {
        headers['Authorization'] = authHeaders['Authorization'];
      }
    }

    try {
      // Convert messages to Vertex AI contents format
      const contents = this.convertMessagesToContents(request.messages);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: contents,
          generationConfig: request.maxTokens ? {
            maxOutputTokens: request.maxTokens,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw this.mapHttpError(response.status, errorText, endpoint);
      }

      const data = await response.json();

      // Parse Vertex AI response format
      if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        const content = candidate.content;
        if (content && content.parts && content.parts.length > 0) {
          const textContent = content.parts
            .filter((part: any) => part.text)
            .map((part: any) => part.text)
            .join('');
          return {
            content: textContent,
            stopReason: candidate.finishReason || 'STOP',
            ...data,
          };
        }
      }

      throw AuthError.networkError('Unexpected response format from Vertex AI API');
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Sends a streaming request to the Vertex AI Gemini endpoint.
   * Processes Server-Sent Events (SSE) format responses.
   * Uses API key in query parameter (if available) or GoogleAuth for bearer token.
   * Following Google Cloud best practices: https://cloud.google.com/docs/authentication/api-keys-use#node.js_1
   */
  async *sendStreamingRequest(request: ModelRequest): AsyncGenerator<ModelResponse, void, unknown> {
    const config = request.config;
    const endpoint = this.buildEndpoint(config);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };

    // For API key: already in endpoint URL as query parameter
    // For bearer token: use GoogleAuth to get Authorization header
    if (!this.apiKey) {
      const client = await this.googleAuth.getClient();
      const authHeaders = await client.getRequestHeaders();
      if (authHeaders['Authorization']) {
        headers['Authorization'] = authHeaders['Authorization'];
      }
    }

    try {
      // Convert messages to Vertex AI contents format
      const contents = this.convertMessagesToContents(request.messages);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: contents,
          generationConfig: request.maxTokens ? {
            maxOutputTokens: request.maxTokens,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw this.mapHttpError(response.status, errorText, endpoint);
      }

      // Check if response is streaming
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') ||
                          contentType.includes('text/plain') ||
                          !contentType.includes('application/json');

      if (!isStreaming) {
        // Fallback to non-streaming if response is JSON
        const responseText = await response.text().catch(() => 'Unable to read response');

        if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
          if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
            throw AuthError.networkError(
              `API returned HTML instead of JSON (likely an error page). Status: ${response.status}`,
              [
                'Verify the endpoint URL is correct',
                'Check if the API endpoint is accessible',
                'Verify authentication credentials are valid',
                `Response preview: ${responseText.substring(0, 200)}...`,
              ],
            );
          }
          throw AuthError.networkError(
            `Unexpected Content-Type: ${contentType}. Expected application/json or text/event-stream.`,
            [
              'Verify the endpoint URL is correct',
              'Check API documentation for correct endpoint format',
              `Response preview: ${responseText.substring(0, 200)}...`,
            ],
          );
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
            throw AuthError.networkError(
              `API returned HTML error page instead of JSON. Status: ${response.status}`,
              [
                'Verify the endpoint URL is correct',
                'Check if the API endpoint is accessible',
                'Verify authentication credentials are valid',
                `Response preview: ${responseText.substring(0, 200)}...`,
              ],
            );
          }
          throw AuthError.networkError(
            `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            [
              'Check if the API endpoint is correct',
              'Verify the response format matches expected JSON structure',
              `Response preview: ${responseText.substring(0, 200)}...`,
            ],
          );
        }

        if (data.candidates && data.candidates.length > 0) {
          const candidate = data.candidates[0];
          const content = candidate.content;
          if (content && content.parts && content.parts.length > 0) {
            const textContent = content.parts
              .filter((part: any) => part.text)
              .map((part: any) => part.text)
              .join('');
            yield {
              content: textContent,
              stopReason: candidate.finishReason || 'STOP',
              ...data,
            };
          }
        }
        return;
      }

      // Process SSE stream
      if (!response.body) {
        throw AuthError.networkError('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') {
              continue;
            }

            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();

              if (dataStr === '[DONE]') {
                return;
              }

              try {
                const data = JSON.parse(dataStr);

                // Parse Vertex AI streaming response format
                if (data.candidates && data.candidates.length > 0) {
                  const candidate = data.candidates[0];
                  if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        yield {
                          content: part.text,
                          stopReason: candidate.finishReason || undefined,
                          ...data,
                        };
                      }
                    }
                  }
                  if (candidate.finishReason) {
                    return;
                  }
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', dataStr, parseError);
              }
            }
          }
        }

        if (buffer.trim()) {
          if (buffer.startsWith('data: ')) {
            const dataStr = buffer.slice(6).trim();
            if (dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr);
                if (data.candidates && data.candidates.length > 0) {
                  const candidate = data.candidates[0];
                  if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        yield {
                          content: part.text,
                          stopReason: candidate.finishReason || undefined,
                          ...data,
                        };
                      }
                    }
                  }
                }
              } catch (parseError) {
                // Ignore parse errors for final chunk
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw AuthError.networkError(`Streaming error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Converts messages format to Vertex AI contents format.
   */
  private convertMessagesToContents(messages: Array<{ role: string; content: string }>): any[] {
    return messages.map((msg) => {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      return {
        role: role,
        parts: [{ text: msg.content }],
      };
    });
  }

  /**
   * Builds the Vertex AI endpoint URL from configuration.
   * Following Google Cloud best practices: https://cloud.google.com/docs/authentication/api-keys-use#node.js_1
   * 
   * For API key: Uses simpler endpoint format with API key in query parameter
   * For Bearer Token: Uses project/location format
   */
  private buildEndpoint(config: ModelAuthConfig): string {
    // Use endpoint_id as the model identifier (e.g., "gemini-2.5-pro")
    const modelId = config.endpoint_id || config.modelId;

    // If API key is available, use simpler endpoint format with API key in query parameter
    // This matches the curl example: ?key=${API_KEY}
    if (this.apiKey) {
      return `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelId}:streamGenerateContent?key=${this.apiKey}`;
    }

    // Otherwise, use bearer token format with project/location
    const baseUrl =
      config.endpoint || `${config.region}-aiplatform.googleapis.com`;
    
    // Handle global region special case
    const endpointBase = config.region === 'global' 
      ? 'aiplatform.googleapis.com'
      : baseUrl;

    return `https://${endpointBase}/v1/projects/${config.projectId}/locations/${config.region}/publishers/google/models/${modelId}:streamGenerateContent`;
  }

  /**
   * Supports streaming responses.
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Returns the authentication method type.
   */
  getAuthMethod(): AuthMethodType {
    return AuthMethodType.BEARER_TOKEN;
  }

  /**
   * Validates that GoogleAuth is available.
   */
  async validateDependencies(): Promise<boolean> {
    // GoogleAuth is always available as it's a dependency
    return true;
  }

  /**
   * Maps HTTP errors to AuthError.
   */
  private mapHttpError(status: number, errorText: string, endpoint?: string): AuthError {
    switch (status) {
      case 401:
        return AuthError.invalidCredentials([
          'Refresh credentials: gcloud auth application-default login',
          'Check IAM permissions for Vertex AI',
        ]);
      case 403:
        return AuthError.invalidCredentials([
          'Check IAM permissions: roles/aiplatform.user',
          'Verify project has Vertex AI API enabled',
        ]);
      case 404:
        const errorDetails = [
          'Verify model ID is correct',
          'Check region configuration',
          'Ensure model is available in your project',
        ];
        if (endpoint) {
          errorDetails.push(`Endpoint URL: ${endpoint}`);
        }
        // Try to parse error message from API response
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorDetails.push(`API Error: ${errorData.error.message}`);
          }
        } catch {
          // If errorText is not JSON, include it as-is
          if (errorText && errorText.length < 200) {
            errorDetails.push(`Response: ${errorText}`);
          }
        }
        return AuthError.invalidConfig(
          'Model endpoint not found',
          errorDetails,
        );
      case 429:
        return AuthError.networkError(
          'Rate limit exceeded',
          ['Wait before retrying', 'Check quota limits'],
        );
      default:
        try {
          const errorData = JSON.parse(errorText);
          return AuthError.networkError(
            errorData.error?.message || `HTTP ${status}: ${errorText}`,
            ['Check API response for details'],
          );
        } catch {
          return AuthError.networkError(
            `HTTP ${status}: ${errorText}`,
            ['Check network connectivity and API status'],
          );
        }
    }
  }

  /**
   * Maps general errors to AuthError.
   */
  private mapError(error: unknown): AuthError {
    if (error instanceof AuthError) {
      return error;
    }

    if (error instanceof Error) {
      if (
        error.message.includes('Could not load the default credentials') ||
        error.message.includes('Unable to detect a Project Id')
      ) {
        return AuthError.missingCredentials([
          'Run: gcloud auth application-default login',
          'Or set GOOGLE_APPLICATION_CREDENTIALS environment variable',
        ]);
      }

      if (
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNREFUSED')
      ) {
        return AuthError.networkError(error.message, [
          'Check network connectivity',
          'Verify firewall settings',
        ]);
      }

      return AuthError.invalidCredentials([error.message]);
    }

    return AuthError.invalidCredentials([
      'Unknown authentication error occurred',
    ]);
  }
}

