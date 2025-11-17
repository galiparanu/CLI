/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthMethodType } from './AuthMethodType.js';
import { AuthError } from './AuthError.js';

/**
 * Result of authentication attempt.
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean;
  /** Bearer token (if applicable) */
  token?: string;
  /** Token expiry timestamp in milliseconds (if applicable) */
  expiresAt?: number;
  /** Error information if authentication failed */
  error?: AuthError;
  /** Authentication method used */
  method: AuthMethodType;
}

/**
 * Creates a successful AuthResult.
 */
export function createSuccessAuthResult(
  method: AuthMethodType,
  token?: string,
  expiresAt?: number,
): AuthResult {
  return {
    success: true,
    method,
    ...(token && { token }),
    ...(expiresAt && { expiresAt }),
  };
}

/**
 * Creates a failed AuthResult.
 */
export function createFailedAuthResult(
  method: AuthMethodType,
  error: AuthError,
): AuthResult {
  return {
    success: false,
    method,
    error,
  };
}

