/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enumeration of credential sources for Vertex AI authentication
 */
export enum CredentialSource {
  /** From GOOGLE_API_KEY environment variable */
  API_KEY = 'API_KEY',
  /** From GOOGLE_APPLICATION_CREDENTIALS JSON file */
  SERVICE_ACCOUNT_FILE = 'SERVICE_ACCOUNT_FILE',
  /** From gcloud CLI configuration */
  ADC_GCLOUD = 'ADC_GCLOUD',
  /** From GCE/GKE metadata service */
  COMPUTE_METADATA = 'COMPUTE_METADATA',
  /** From cached OAuth tokens */
  OAUTH_CACHED = 'OAUTH_CACHED',
}

/**
 * Represents a temporary bearer token for API authentication
 */
export interface AccessToken {
  /** The actual bearer token value */
  token: string;
  /** Unix timestamp (ms) when token expires */
  expiryTime?: number;
  /** Token type for Authorization header */
  tokenType: 'Bearer';
  /** OAuth scopes if applicable */
  scope?: string[];
}

/**
 * Configuration derived from environment variables
 */
export interface EnvironmentConfiguration {
  /** GCP project ID */
  googleCloudProject?: string;
  /** GCP region (e.g., 'us-central1', 'global') */
  googleCloudLocation?: string;
  /** API key for express mode */
  googleApiKey?: string;
  /** Path to service account JSON */
  googleApplicationCredentials?: string;
  /** Whether Vertex AI mode is enabled */
  useVertexAI: boolean;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Actionable steps to fix the error */
  remediationSteps: string[];
}

/**
 * Result of validation operation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors */
  errors?: ValidationError[];
  /** Non-blocking warnings */
  warnings?: string[];
}

/**
 * Result of authentication detection
 */
export interface AuthenticationResult {
  /** Detected authentication type */
  authType: string | null;
  /** Source of credentials */
  credentialSource: CredentialSource | null;
  /** Error if detection failed */
  error?: Error;
}
