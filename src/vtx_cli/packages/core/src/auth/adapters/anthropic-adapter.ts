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
 * Adapter for authenticating to Anthropic models via Vertex AI REST API.
 * Uses bearer token authentication with Anthropic-specific endpoint format.
 * 
 * Endpoint format: /v1/projects/{project}/locations/{region}/publishers/anthropic/models/{model}:streamRawPredict
 * Request format: { "anthropic_version": "vertex-2023-10-16", "messages": [...], "max_tokens": 1024, "stream": true }
 */
export class AnthropicAdapter implements ModelAuthAdapter {
  private tokenCache: Map<string, CachedToken> = new Map();
  private googleAuth: GoogleAuth;

  constructor(googleAuth?: GoogleAuth) {
    this.googleAuth = googleAuth || new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Validates that required dependencies are available.
   * For Anthropic adapter, only GoogleAuth is needed (no Python dependencies).
   */
  async validateDependencies(): Promise<boolean> {
    // GoogleAuth is always available (it's a Node.js package)
    return true;
  }

  /**
   * Authenticate using bearer token via GoogleAuth.
   * Performance target: < 5 seconds for token acquisition.
   */
  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    const startTime = Date.now();
    try {
      // Validate project ID
      if (!config.projectId || config.projectId.trim().length === 0) {
        return createFailedAuthResult(
          AuthMethodType.BEARER_TOKEN,
          AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT'),
        );
      }

      // Get access token
      const client = await this.googleAuth.getClient();
      const accessTokenResponse = await client.getAccessToken();

      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(
          `[AnthropicAdapter] Authentication took ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
        );
      }

      if (!accessTokenResponse.token) {
        return createFailedAuthResult(
          AuthMethodType.BEARER_TOKEN,
          AuthError.invalidCredentials([
            'Run: gcloud auth application-default login',
            'Ensure your gcloud user has necessary IAM permissions',
            'Check that Vertex AI API is enabled for the project',
          ]),
        );
      }

      // Calculate expiry time
      const expiryDate = client.credentials?.expiry_date;
      const expiresAt = expiryDate
        ? expiryDate
        : Date.now() + 3600000; // Default to 1 hour

      // Cache the token
      const cachedToken = new CachedToken(
        accessTokenResponse.token,
        expiresAt,
        'Bearer',
      );
      this.tokenCache.set(config.modelAlias, cachedToken);

      return createSuccessAuthResult(
        AuthMethodType.BEARER_TOKEN,
        accessTokenResponse.token,
        expiresAt,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(
          `[AnthropicAdapter] Authentication failed after ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
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
        ]);
      }

      // Calculate expiry time
      const expiryDate = client.credentials?.expiry_date;
      const expiresAt = expiryDate
        ? expiryDate
        : Date.now() + 3600000; // Default to 1 hour

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
   * Sends a request to Anthropic model via REST API.
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    // If streaming is requested, use streaming method
    if (request.stream) {
      // For streaming, we need to collect all chunks and return the complete response
      // This is a limitation - ideally we'd return an AsyncGenerator, but the interface
      // doesn't support that for sendRequest. We'll use sendStreamingRequest internally.
      let fullContent = '';
      let stopReason: string | undefined;

      for await (const chunk of this.sendStreamingRequest(request)) {
        fullContent += chunk.content || '';
        if (chunk.stopReason) {
          stopReason = chunk.stopReason;
        }
      }

      return {
        content: fullContent,
        stopReason: stopReason,
      };
    }

    // Non-streaming request
    const config = request.config;
    const token = await this.getToken(config);
    const endpoint = this.buildEndpoint(config);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          anthropic_version: 'vertex-2023-10-16',
          messages: request.messages.map((msg: { role: string; content: string }) => ({
            role: msg.role,
            content: msg.content,
          })),
          max_tokens: request.maxTokens || 1024,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        // For rate limit errors, try to extract Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const retrySeconds = parseInt(retryAfter, 10);
            if (!isNaN(retrySeconds)) {
              throw this.mapHttpErrorWithRetry(response.status, errorText, retrySeconds);
            }
          }
        }
        
        throw this.mapHttpError(response.status, errorText);
      }

      // Read response text once
      const responseText = await response.text().catch(() => 'Unable to read response');

      // Check Content-Type before parsing JSON
      const contentType = response.headers.get('content-type') || '';
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
          `Unexpected Content-Type: ${contentType}. Expected application/json.`,
          [
            'Verify the endpoint URL is correct',
            'Check API documentation for correct endpoint format',
            `Response preview: ${responseText.substring(0, 200)}...`,
          ],
        );
      }

      // Parse JSON response
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

      // Parse Anthropic response format
      // Anthropic API returns: { "content": [...], "stop_reason": "..." }
      if (data.content && Array.isArray(data.content)) {
        const textContent = data.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join('');
        return {
          content: textContent,
          stopReason: data.stop_reason || data.stopReason,
          ...data,
        };
      }

      throw AuthError.networkError('Unexpected response format from API');
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      if (error instanceof Error) {
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw AuthError.networkError(
            error.message,
            ['Check network connectivity', 'Verify endpoint URL'],
          );
        }
      }

      throw AuthError.networkError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Sends a streaming request to the Anthropic endpoint.
   * Processes Server-Sent Events (SSE) format responses.
   */
  async *sendStreamingRequest(request: ModelRequest): AsyncGenerator<ModelResponse, void, unknown> {
    const config = request.config;
    const token = await this.getToken(config);
    const endpoint = this.buildEndpoint(config);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          anthropic_version: 'vertex-2023-10-16',
          messages: request.messages.map((msg: { role: string; content: string }) => ({
            role: msg.role,
            content: msg.content,
          })),
          max_tokens: request.maxTokens || 1024,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        // For rate limit errors, try to extract Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const retrySeconds = parseInt(retryAfter, 10);
            if (!isNaN(retrySeconds)) {
              throw this.mapHttpErrorWithRetry(response.status, errorText, retrySeconds);
            }
          }
        }
        
        throw this.mapHttpError(response.status, errorText);
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

        // Parse JSON response
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

        // Parse Anthropic response format
        if (data.content && Array.isArray(data.content)) {
          const textContent = data.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('');
          yield {
            content: textContent,
            stopReason: data.stop_reason || data.stopReason,
            ...data,
          };
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

          // Process complete lines
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

                // Parse Anthropic streaming response format according to official documentation:
                // https://docs.claude.com/en/docs/build-with-claude/streaming#streaming-with-sdks
                
                // Handle error events (e.g., overloaded_error)
                if (data.type === 'error') {
                  const errorType = data.error?.type || 'unknown_error';
                  const errorMessage = data.error?.message || 'Unknown error';
                  throw AuthError.networkError(
                    `Streaming error: ${errorType} - ${errorMessage}`,
                    ['Retry the request', 'Check API status'],
                  );
                }

                // Handle ping events (ignore, but don't error)
                if (data.type === 'ping') {
                  continue;
                }

                // Handle message_start (contains Message object with empty content)
                if (data.type === 'message_start') {
                  // Can be used for initialization, but no content to yield yet
                  continue;
                }

                // Handle content_block_start (start of a content block)
                if (data.type === 'content_block_start') {
                  // Can be used for tracking content blocks, but no content to yield yet
                  continue;
                }

                // Handle content_block_delta with different delta types
                // According to docs: text_delta, input_json_delta, thinking_delta, signature_delta
                if (data.type === 'content_block_delta') {
                  const delta = data.delta;
                  
                  // Text delta: { "type": "text_delta", "text": "..." }
                  if (delta?.type === 'text_delta') {
                    yield {
                      content: delta.text || '',
                      stopReason: undefined,
                      ...data,
                    };
                  }
                  // Thinking delta: { "type": "thinking_delta", "thinking": "..." }
                  // Note: We skip thinking deltas as they're internal reasoning
                  else if (delta?.type === 'thinking_delta') {
                    // Skip thinking content (internal reasoning)
                    continue;
                  }
                  // Signature delta: { "type": "signature_delta", "signature": "..." }
                  // Note: Used for verifying thinking block integrity, skip
                  else if (delta?.type === 'signature_delta') {
                    continue;
                  }
                  // Input JSON delta: { "type": "input_json_delta", "partial_json": "..." }
                  // Note: For tool_use blocks, we skip these as they're partial JSON
                  else if (delta?.type === 'input_json_delta') {
                    // Skip partial JSON deltas (for tool_use blocks)
                    continue;
                  }
                }

                // Handle content_block_stop (end of content block)
                if (data.type === 'content_block_stop') {
                  // No content to yield, just marking end of block
                  continue;
                }

                // Handle message_delta (top-level changes to Message object)
                // Contains stop_reason and cumulative usage
                if (data.type === 'message_delta') {
                  if (data.delta?.stop_reason) {
                    yield {
                      content: '',
                      stopReason: data.delta.stop_reason,
                      ...data,
                    };
                  }
                  // Continue to process usage info if needed
                  continue;
                }

                // Handle message_stop (final event)
                if (data.type === 'message_stop') {
                  return;
                }
              } catch (parseError) {
                // If it's an AuthError, re-throw it
                if (parseError instanceof AuthError) {
                  throw parseError;
                }
                // Skip malformed JSON lines
                console.warn('Failed to parse SSE data:', dataStr, parseError);
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          if (buffer.startsWith('data: ')) {
            const dataStr = buffer.slice(6).trim();
            if (dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr);
                
                // Handle text_delta in final buffer
                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  yield {
                    content: data.delta.text || '',
                    stopReason: undefined,
                    ...data,
                  };
                }
                // Handle message_stop in final buffer
                else if (data.type === 'message_stop') {
                  return;
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
   * Builds the Anthropic endpoint URL from configuration.
   * Format: /v1/projects/{project}/locations/{region}/publishers/anthropic/models/{model}:streamRawPredict
   */
  private buildEndpoint(config: ModelAuthConfig): string {
    const baseUrl =
      config.endpoint || `${config.region}-aiplatform.googleapis.com`;
    
    // Handle global region special case
    const endpointBase = config.region === 'global' 
      ? 'aiplatform.googleapis.com'
      : baseUrl;

    // Use endpoint_id as the model identifier (e.g., "claude-sonnet-4-5@20250929")
    const modelId = config.endpoint_id || config.modelId;

    return `https://${endpointBase}/v1/projects/${config.projectId}/locations/${config.region}/publishers/anthropic/models/${modelId}:streamRawPredict`;
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
   * Maps errors to AuthError instances.
   */
  private mapError(error: unknown): AuthError {
    if (error instanceof AuthError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        return AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT');
      }

      if (error.message.includes('unauthorized') || error.message.includes('Unauthorized')) {
        return AuthError.invalidCredentials([
          'Run: gcloud auth application-default login',
          'Verify your Google Cloud credentials are valid',
        ]);
      }
    }

    return AuthError.networkError(
      error instanceof Error ? error.message : String(error),
    );
  }

  /**
   * Maps HTTP status codes to AuthError instances with retry delay information.
   */
  private mapHttpErrorWithRetry(status: number, errorText: string, retryAfterSeconds: number): AuthError {
    if (status === 429) {
      return AuthError.networkError(
        `Rate limit exceeded. Please retry in ${retryAfterSeconds}s.`,
        [
          `Wait ${retryAfterSeconds} seconds before retrying`,
          'Check your quota limits in Google Cloud Console',
          'Verify project has sufficient quota for Claude Sonnet 4.5',
        ],
      );
    }
    return this.mapHttpError(status, errorText);
  }

  /**
   * Maps HTTP status codes to AuthError instances.
   */
  private mapHttpError(status: number, errorText: string): AuthError {
    switch (status) {
      case 401:
        return AuthError.invalidCredentials([
          'Run: gcloud auth application-default login',
          'Verify your Google Cloud credentials are valid',
          'Check that Vertex AI API is enabled for the project',
        ]);
      case 403:
        return AuthError.invalidCredentials([
          'Check IAM permissions for Vertex AI API',
          'Ensure your account has "Vertex AI User" role',
          `Error: ${errorText.substring(0, 200)}`,
        ]);
      case 404:
        return AuthError.networkError(
          'Endpoint not found. Verify the model ID and region are correct.',
          [
            `Model ID: ${errorText.substring(0, 200)}`,
            'Check that the model is available in the specified region',
          ],
        );
      case 429:
        // Try to parse error message for retry delay
        const retryMatch = errorText.match(/retry.*?(\d+)\s*(?:second|sec|s)/i);
        if (retryMatch && retryMatch[1]) {
          const retrySeconds = parseInt(retryMatch[1], 10);
          return AuthError.networkError(
            `Rate limit exceeded. Please retry in ${retrySeconds}s.`,
            [
              `Wait ${retrySeconds} seconds before retrying`,
              'Check your quota limits in Google Cloud Console',
              'Verify project has sufficient quota for Claude Sonnet 4.5',
            ],
          );
        }
        return AuthError.networkError(
          'Rate limit exceeded. Please try again later.',
          [
            'Wait a few seconds before retrying',
            'Check your quota limits in Google Cloud Console',
            'Verify project has sufficient quota for Claude Sonnet 4.5',
          ],
        );
      default:
        return AuthError.networkError(
          `HTTP ${status}: ${errorText.substring(0, 200)}`,
          ['Check API documentation', 'Verify request format'],
        );
    }
  }
}

