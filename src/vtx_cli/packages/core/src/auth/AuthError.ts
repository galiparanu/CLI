/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error codes for authentication failures.
 */
export enum AuthErrorCode {
  /** No credentials found */
  MISSING_CREDENTIALS = 'MISSING_CREDENTIALS',
  /** Credentials are invalid or expired */
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  /** Required SDK or tool not installed */
  MISSING_DEPENDENCY = 'MISSING_DEPENDENCY',
  /** Required environment variable not set */
  MISSING_ENV_VAR = 'MISSING_ENV_VAR',
  /** Model configuration is invalid */
  INVALID_CONFIG = 'INVALID_CONFIG',
  /** Network error during authentication */
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Represents authentication errors with actionable messages.
 */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly actionableSteps: string[] = [],
    public readonly missingDependency?: string,
  ) {
    super(message);
    this.name = 'AuthError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /**
   * Creates an AuthError for missing credentials.
   */
  static missingCredentials(actionableSteps: string[] = []): AuthError {
    return new AuthError(
      AuthErrorCode.MISSING_CREDENTIALS,
      'No valid Google Cloud credentials found',
      actionableSteps.length > 0
        ? actionableSteps
        : ['Run: gcloud auth application-default login'],
    );
  }

  /**
   * Creates an AuthError for invalid credentials.
   */
  static invalidCredentials(actionableSteps: string[] = []): AuthError {
    return new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      'Credentials are invalid or expired',
      actionableSteps.length > 0
        ? actionableSteps
        : ['Refresh credentials: gcloud auth application-default login'],
    );
  }

  /**
   * Creates an AuthError for missing dependency.
   */
  static missingDependency(
    dependency: string,
    installationCommand: string,
  ): AuthError {
    return new AuthError(
      AuthErrorCode.MISSING_DEPENDENCY,
      `Required dependency not found: ${dependency}`,
      [`Install with: ${installationCommand}`],
      dependency,
    );
  }

  /**
   * Creates an AuthError for missing environment variable.
   */
  static missingEnvVar(variableName: string): AuthError {
    return new AuthError(
      AuthErrorCode.MISSING_ENV_VAR,
      `Required environment variable not set: ${variableName}`,
      [`Set environment variable: export ${variableName}=<value>`],
    );
  }

  /**
   * Creates an AuthError for invalid configuration.
   */
  static invalidConfig(message: string, actionableSteps: string[] = []): AuthError {
    return new AuthError(
      AuthErrorCode.INVALID_CONFIG,
      `Invalid model configuration: ${message}`,
      actionableSteps,
    );
  }

  /**
   * Creates an AuthError for network errors.
   */
  static networkError(
    message: string,
    actionableSteps: string[] = ['Check network connectivity and retry'],
  ): AuthError {
    return new AuthError(
      AuthErrorCode.NETWORK_ERROR,
      `Network error: ${message}`,
      actionableSteps,
    );
  }
}

