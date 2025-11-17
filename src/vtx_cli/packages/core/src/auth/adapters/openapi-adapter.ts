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
 * Adapter for authenticating to models via OpenAPI endpoints using bearer tokens.
 * Supports DeepSeek, Qwen, and Kimi models.
 */
export class OpenAPIAdapter implements ModelAuthAdapter {
  private tokenCache: Map<string, CachedToken> = new Map();
  private readonly googleAuth: GoogleAuth;

  constructor() {
    this.googleAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Authenticate using bearer token from GoogleAuth.
   * Performance target: < 5 seconds for bearer token authentication.
   */
  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    const startTime = Date.now();
    try {
      const token = await this.getToken(config);
      const cachedToken = this.tokenCache.get(config.modelAlias);
      const duration = Date.now() - startTime;
      
      if (duration > 5000) {
        console.warn(
          `[OpenAPIAdapter] Authentication took ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
        );
      }
      
      return createSuccessAuthResult(
        AuthMethodType.BEARER_TOKEN,
        token,
        cachedToken?.expiresAt,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(
          `[OpenAPIAdapter] Authentication failed after ${duration}ms (target: <5000ms) for ${config.modelAlias}`,
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
      if (error instanceof AuthError) {
        throw error;
      }

      // Map common GoogleAuth errors
      if (error instanceof Error) {
        if (
          error.message.includes('Could not load the default credentials') ||
          error.message.includes('Unable to detect a Project Id')
        ) {
          throw AuthError.missingCredentials([
            'Run: gcloud auth application-default login',
            'Or set GOOGLE_APPLICATION_CREDENTIALS environment variable',
          ]);
        }

        if (
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNREFUSED')
        ) {
          throw AuthError.networkError(
            error.message,
            ['Check network connectivity', 'Verify firewall settings'],
          );
        }
      }

      throw AuthError.invalidCredentials([
        'Run: gcloud auth application-default login',
        'Check credential configuration',
      ]);
    }
  }

  /**
   * Formats the model ID for OpenAPI endpoint.
   * For OpenAPI endpoints, the model ID should be used as-is from the configuration.
   * Format examples:
   * - Publisher/model format: "qwen/qwen3-coder-480b-a35b-instruct-maas"
   * - Simple model ID: "gemini-1.0-pro"
   * 
   * Note: OpenAPI endpoints accept the publisher/model format directly, not full resource names.
   */
  private formatModelId(config: ModelAuthConfig): string {
    // OpenAPI endpoints accept model IDs in publisher/model format directly
    // No conversion needed - use the model ID as-is from configuration
    return config.modelId;
  }

  /**
   * Sends a request to the OpenAPI endpoint.
   * Supports both non-streaming and streaming responses.
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    // If streaming is requested, use streaming method
    if (request.stream) {
      // For streaming, we need to collect all chunks and return final response
      // This maintains backward compatibility with ModelResponse interface
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
        stopReason: stopReason || 'stop',
      };
    }

    // Non-streaming request
    const config = request.config;
    const token = await this.getToken(config);
    const endpoint = this.buildEndpoint(config);
    const formattedModelId = this.formatModelId(config);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: formattedModelId,
          stream: false,
          messages: request.messages.map((msg: { role: string; content: string }) => ({
            role: msg.role,
            content: msg.content,
          })),
          ...(request.maxTokens && { max_tokens: request.maxTokens }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const formattedModelId = this.formatModelId(config);
        // Log endpoint and model ID for debugging
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[OpenAPIAdapter] Request failed:`, {
            endpoint,
            modelId: formattedModelId,
            status: response.status,
            errorText: errorText.substring(0, 500),
          });
        }
        throw this.mapHttpError(response.status, errorText, endpoint, formattedModelId);
      }

      // Read response text once (response body can only be read once)
      const responseText = await response.text().catch(() => 'Unable to read response');
      
      // Check Content-Type before parsing JSON
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
        // Check if response is HTML (error page)
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
        // Check if response is HTML (even if Content-Type says JSON)
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

      // Parse OpenAPI response format
      if (data.choices && data.choices.length > 0) {
        const choice = data.choices[0];
        return {
          content: choice.message?.content || choice.delta?.content || '',
          stopReason: choice.finish_reason || choice.stop_reason,
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
   * Sends a streaming request to the OpenAPI endpoint.
   * Processes Server-Sent Events (SSE) format responses.
   * @param request Model request with stream=true
   * @returns AsyncGenerator yielding ModelResponse chunks
   */
  async *sendStreamingRequest(request: ModelRequest): AsyncGenerator<ModelResponse, void, unknown> {
    const config = request.config;
    const token = await this.getToken(config);
    const endpoint = this.buildEndpoint(config);

    try {
      const formattedModelId = this.formatModelId(config);
      
      // OpenAPI chat completions format (same for all OpenAPI models)
      const requestBody = {
        model: formattedModelId,
        stream: true,
        messages: request.messages.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.content,
        })),
        ...(request.maxTokens && { max_tokens: request.maxTokens }),
      };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const formattedModelId = this.formatModelId(config);
        // Log endpoint and model ID for debugging
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[OpenAPIAdapter] Streaming request failed:`, {
            endpoint,
            modelId: formattedModelId,
            status: response.status,
            errorText: errorText.substring(0, 500),
          });
        }
        throw this.mapHttpError(response.status, errorText, endpoint, formattedModelId);
      }

      // Check if response is streaming (text/event-stream or text/plain with SSE format)
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || 
                         contentType.includes('text/plain') ||
                         !contentType.includes('application/json');

      if (!isStreaming) {
        // Fallback to non-streaming if response is JSON
        // Read response text once (response body can only be read once)
        const responseText = await response.text().catch(() => 'Unable to read response');
        
        // Check Content-Type before parsing JSON (reuse contentType from above)
        if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
          // Check if response is HTML (error page)
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
          // Check if response is HTML (even if Content-Type says JSON)
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

        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          yield {
            content: choice.message?.content || choice.delta?.content || '',
            stopReason: choice.finish_reason || choice.stop_reason,
            ...data,
          };
        }
        return;
      }

      // Process SSE stream
      if (!response.body) {
        throw AuthError.networkError('Response body is null');
      }

      // Convert ReadableStream to Node.js Readable stream
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
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') {
              continue; // Skip empty lines
            }

            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              
              // Handle [DONE] marker
              if (dataStr === '[DONE]') {
                return;
              }

              try {
                const data = JSON.parse(dataStr);
                
                // Parse OpenAPI streaming response format
                if (data.choices && data.choices.length > 0) {
                  const choice = data.choices[0];
                  const delta = choice.delta;
                  
                  yield {
                    content: delta?.content || '',
                    stopReason: choice.finish_reason || choice.stop_reason,
                    ...data,
                  };

                  // If finish_reason is set, stream is complete
                  if (choice.finish_reason) {
                    return;
                  }
                }
              } catch (parseError) {
                // Skip malformed JSON lines
                console.warn('Failed to parse SSE data:', dataStr, parseError);
              }
            }
            // Ignore other SSE fields (id, event, etc.)
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          if (buffer.startsWith('data: ')) {
            const dataStr = buffer.slice(6).trim();
            if (dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr);
                if (data.choices && data.choices.length > 0) {
                  const choice = data.choices[0];
                  yield {
                    content: choice.delta?.content || '',
                    stopReason: choice.finish_reason || choice.stop_reason,
                    ...data,
                  };
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
   * Builds the OpenAPI endpoint URL from configuration.
   * All OpenAPI models use the same endpoint format: /endpoints/openapi/chat/completions
   * Model ID is passed in the request body, not in the URL path.
   */
  private buildEndpoint(config: ModelAuthConfig): string {
    // Use custom endpoint if provided, otherwise construct from region
    const baseUrl =
      config.endpoint || `${config.region}-aiplatform.googleapis.com`;
    
    // Handle global region special case (aiplatform.googleapis.com)
    const endpointBase = config.region === 'global' 
      ? 'aiplatform.googleapis.com'
      : baseUrl;

    // All OpenAPI models use the same endpoint format
    // Model ID (e.g., "deepseek-ai/deepseek-v3.1-maas") is passed in request body
    return `https://${endpointBase}/v1/projects/${config.projectId}/locations/${config.region}/endpoints/openapi/chat/completions`;
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
  private mapHttpError(status: number, errorText: string, endpoint?: string, modelId?: string): AuthError {
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
        if (modelId) {
          errorDetails.push(`Model ID: ${modelId}`);
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

