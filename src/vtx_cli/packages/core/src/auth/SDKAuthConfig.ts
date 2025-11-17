/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents SDK-based authentication configuration.
 */
export interface SDKAuthConfig {
  /** Which SDK to use */
  sdkType: 'claude' | 'gemini';
  /** GCP region (typically "global") */
  region: string;
  /** Google Cloud project ID */
  projectId: string;
  /** Model identifier for the SDK */
  modelId: string;
  /** Path to Python executable (optional, defaults to "python3") */
  pythonPath?: string;
}

/**
 * Validates an SDKAuthConfig object.
 * @param config The SDKAuthConfig object to validate
 * @throws Error if validation fails
 */
export function validateSDKAuthConfig(config: SDKAuthConfig): void {
  if (config.sdkType !== 'claude' && config.sdkType !== 'gemini') {
    throw new Error("SDK type must be 'claude' or 'gemini'");
  }

  if (!config.region || config.region.trim().length === 0) {
    throw new Error('Region must be a non-empty string');
  }

  if (!config.projectId || config.projectId.trim().length === 0) {
    throw new Error('Project ID must be a non-empty string');
  }

  if (!config.modelId || config.modelId.trim().length === 0) {
    throw new Error('Model ID must be a non-empty string');
  }
}

