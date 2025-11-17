/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthMethodType } from './AuthMethodType.js';
import type { AuthResult } from './AuthResult.js';
import type { ModelAuthConfig } from '../services/modelService.js';

/**
 * Represents a model request with messages and parameters.
 */
export interface ModelRequest {
  /** Model authentication configuration */
  config: ModelAuthConfig;
  /** Chat messages */
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  /** Whether to stream the response */
  stream?: boolean;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Additional parameters */
  [key: string]: unknown;
}

/**
 * Represents a model response.
 */
export interface ModelResponse {
  /** Response content */
  content: string;
  /** Stop reason */
  stopReason?: string;
  /** Additional response data */
  [key: string]: unknown;
}

/**
 * Interface for model-specific authentication adapters.
 */
export interface ModelAuthAdapter {
  /**
   * Authenticate using the configured method for this model.
   * @param config Model authentication configuration
   * @returns Authentication result with token or error
   */
  authenticate(config: ModelAuthConfig): Promise<AuthResult>;

  /**
   * Send a request to the model using authenticated connection.
   * @param request Model request with messages and parameters
   * @returns Model response
   */
  sendRequest(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Check if this adapter supports streaming responses.
   * @returns true if streaming is supported
   */
  supportsStreaming(): boolean;

  /**
   * Get the authentication method type this adapter handles.
   * @returns AuthMethodType
   */
  getAuthMethod(): AuthMethodType;

  /**
   * Validate that required dependencies are available.
   * @returns Promise resolving to true if dependencies are available, false otherwise
   */
  validateDependencies(): Promise<boolean>;
}

