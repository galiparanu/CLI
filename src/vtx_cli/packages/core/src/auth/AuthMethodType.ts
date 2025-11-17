/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enumeration of supported authentication methods per model.
 */
export enum AuthMethodType {
  /** Bearer token via OpenAPI endpoint (DeepSeek, Qwen, Kimi) */
  BEARER_TOKEN = 'bearer_token',
  /** Claude SDK authentication (Claude Sonnet 4.5) */
  CLAUDE_SDK = 'claude_sdk',
  /** Gemini SDK with Vertex AI mode (Gemini 2.5 Pro) */
  GEMINI_SDK = 'gemini_sdk',
}

/**
 * Parses a string value to AuthMethodType enum.
 * @param value The string value from models.yaml
 * @returns The corresponding AuthMethodType
 * @throws Error if the value is not a valid auth method
 */
export function parseAuthMethod(value: string): AuthMethodType {
  switch (value) {
    case 'bearer_token':
      return AuthMethodType.BEARER_TOKEN;
    case 'claude_sdk':
      return AuthMethodType.CLAUDE_SDK;
    case 'gemini_sdk':
      return AuthMethodType.GEMINI_SDK;
    default:
      throw new Error(`Unknown auth method: ${value}`);
  }
}

/**
 * Validates that an auth method value is valid.
 * @param value The string value to validate
 * @returns true if valid, false otherwise
 */
export function isValidAuthMethod(value: string): boolean {
  return Object.values(AuthMethodType).includes(value as AuthMethodType);
}

