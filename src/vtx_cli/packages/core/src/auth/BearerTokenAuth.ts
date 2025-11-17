/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents bearer token authentication for OpenAPI endpoints.
 */
export interface BearerTokenAuth {
  /** The bearer token value */
  token: string;
  /** Unix timestamp (ms) when token expires */
  expiresAt: number;
  /** GCP region for endpoint construction */
  region: string;
  /** Full endpoint URL */
  endpoint: string;
  /** Google Cloud project ID */
  projectId: string;
}

/**
 * Validates a BearerTokenAuth object.
 * @param auth The BearerTokenAuth object to validate
 * @throws Error if validation fails
 */
export function validateBearerTokenAuth(auth: BearerTokenAuth): void {
  if (!auth.token || auth.token.trim().length === 0) {
    throw new Error('Token must be a non-empty string');
  }

  if (auth.expiresAt <= Date.now()) {
    throw new Error('Token expiry time must be in the future');
  }

  if (!auth.region || auth.region.trim().length === 0) {
    throw new Error('Region must be a non-empty string');
  }

  if (!auth.endpoint || auth.endpoint.trim().length === 0) {
    throw new Error('Endpoint must be a non-empty string');
  }

  // Basic URL validation
  try {
    new URL(auth.endpoint);
  } catch {
    throw new Error('Endpoint must be a valid URL');
  }

  if (!auth.projectId || auth.projectId.trim().length === 0) {
    throw new Error('Project ID must be a non-empty string');
  }
}

