/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../utils/debugLogger.js';

/**
 * Interface for credential providers that support cleanup
 */
export interface CleanableCredentialProvider {
  clearCredentials(): void | Promise<void>;
  isAuthenticated(): boolean;
}

/**
 * Centralized credential manager to track and cleanup all active credential providers
 */
class CredentialManager {
  private providers: Set<CleanableCredentialProvider> = new Set();

  /**
   * Register a credential provider for cleanup tracking
   */
  registerProvider(provider: CleanableCredentialProvider): void {
    this.providers.add(provider);
    debugLogger.debug('Registered credential provider for cleanup');
  }

  /**
   * Unregister a credential provider
   */
  unregisterProvider(provider: CleanableCredentialProvider): void {
    this.providers.delete(provider);
    debugLogger.debug('Unregistered credential provider from cleanup');
  }

  /**
   * Clear all registered credential providers
   * Called on application exit to ensure credentials are removed from memory
   */
  async clearAll(): Promise<void> {
    debugLogger.debug(
      `Clearing credentials for ${this.providers.size} provider(s)`,
    );

    const clearPromises: Promise<void>[] = [];

    for (const provider of this.providers) {
      try {
        const result = provider.clearCredentials();
        if (result instanceof Promise) {
          clearPromises.push(result);
        }
      } catch (error) {
        // Log but don't throw - cleanup should be best-effort
        debugLogger.warn('Failed to clear credentials for provider:', error);
      }
    }

    // Wait for all async clears to complete
    if (clearPromises.length > 0) {
      await Promise.allSettled(clearPromises);
    }

    this.providers.clear();
    debugLogger.debug('All credentials cleared');
  }

  /**
   * Get count of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }
}

// Singleton instance
export const credentialManager = new CredentialManager();
