/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a cached authentication token with expiry information.
 */
export class CachedToken {
  /** Default refresh buffer: 5 minutes before expiry */
  private static readonly DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(
    public readonly token: string,
    public readonly expiresAt: number,
    public readonly tokenType: 'Bearer' = 'Bearer',
    public readonly refreshBuffer: number = CachedToken.DEFAULT_REFRESH_BUFFER_MS,
  ) {
    this.validate();
  }

  /**
   * Validates the token data.
   * @throws Error if validation fails
   */
  private validate(): void {
    if (!this.token || this.token.trim().length === 0) {
      throw new Error('Token must be a non-empty string');
    }

    if (this.expiresAt <= Date.now()) {
      throw new Error('Token expiry time must be in the future');
    }

    if (this.tokenType !== 'Bearer') {
      throw new Error("Token type must be 'Bearer'");
    }

    if (this.refreshBuffer <= 0) {
      throw new Error('Refresh buffer must be a positive number');
    }
  }

  /**
   * Checks if the token is still valid (not expired).
   */
  isValid(): boolean {
    return this.expiresAt > Date.now();
  }

  /**
   * Checks if the token needs to be refreshed (within refresh buffer).
   */
  needsRefresh(): boolean {
    return this.expiresAt - Date.now() < this.refreshBuffer;
  }

  /**
   * Gets the time remaining until expiry in milliseconds.
   */
  getTimeUntilExpiry(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  /**
   * Gets the time remaining until refresh is needed in milliseconds.
   */
  getTimeUntilRefresh(): number {
    return Math.max(0, this.expiresAt - Date.now() - this.refreshBuffer);
  }
}

