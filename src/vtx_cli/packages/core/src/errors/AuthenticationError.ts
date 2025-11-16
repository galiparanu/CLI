/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error codes for authentication failures
 */
export enum AuthErrorCode {
  /** Required environment variables not set */
  MISSING_ENV = 'MISSING_ENV',
  /** Credentials are malformed or expired */
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  /** Credentials lack necessary IAM permissions */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Vertex AI API not enabled for project */
  API_NOT_ENABLED = 'API_NOT_ENABLED',
  /** Service account JSON file is malformed */
  INVALID_JSON = 'INVALID_JSON',
  /** Service account JSON file does not exist */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  /** Unable to reach Google Cloud authentication endpoints */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Token has expired */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** Token refresh failed */
  REFRESH_FAILED = 'REFRESH_FAILED',
}

/**
 * Structured error for authentication failures with remediation steps
 */
export class AuthenticationError extends Error {
  /**
   * Create an authentication error
   * @param code Error code identifying the type of failure
   * @param message Human-readable error description
   * @param remediationSteps Actionable steps to fix the error
   * @param originalError Underlying error object if applicable
   */
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly remediationSteps: string[],
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'AuthenticationError';
    
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthenticationError);
    }
  }

  /**
   * Format error with remediation steps for display
   */
  override toString(): string {
    let msg = `${this.name} [${this.code}]: ${this.message}\n`;
    
    if (this.remediationSteps.length > 0) {
      msg += '\nTo fix this issue:\n';
      this.remediationSteps.forEach((step, i) => {
        msg += `  ${i + 1}. ${step}\n`;
      });
    }
    
    return msg;
  }

  /**
   * Create error for missing environment variables
   */
  static missingEnvironment(missingVars: string[]): AuthenticationError {
    return new AuthenticationError(
      AuthErrorCode.MISSING_ENV,
      `Required environment variables not set: ${missingVars.join(', ')}`,
      [
        'When using Vertex AI, you must specify either:',
        '  • GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables',
        '  • GOOGLE_API_KEY environment variable (if using express mode)',
        'Update your .env file or export variables in your shell',
        'Example: export GOOGLE_CLOUD_PROJECT=your-project-id',
      ],
    );
  }

  /**
   * Create error for invalid service account JSON file
   */
  static invalidServiceAccountJson(filePath: string, reason?: string): AuthenticationError {
    const reasonMsg = reason ? `: ${reason}` : '';
    return new AuthenticationError(
      AuthErrorCode.INVALID_JSON,
      `Service account JSON is malformed${reasonMsg}`,
      [
        `Verify file is valid JSON: ${filePath}`,
        'Check file is not corrupted',
        'Ensure file contains "type": "service_account"',
        'Download a fresh service account key from Google Cloud Console',
      ],
    );
  }

  /**
   * Create error for file not found
   */
  static fileNotFound(filePath: string): AuthenticationError {
    return new AuthenticationError(
      AuthErrorCode.FILE_NOT_FOUND,
      `Service account file not found: ${filePath}`,
      [
        'Verify GOOGLE_APPLICATION_CREDENTIALS path is correct',
        'Ensure file exists and is readable',
        'Use absolute path to avoid relative path issues',
        'Download a new service account key from Google Cloud Console',
      ],
    );
  }

  /**
   * Create error for permission denied
   */
  static permissionDenied(projectId?: string): AuthenticationError {
    const projectMsg = projectId ? ` for project ${projectId}` : '';
    return new AuthenticationError(
      AuthErrorCode.PERMISSION_DENIED,
      `Authentication failed: Permission denied accessing Vertex AI${projectMsg}`,
      [
        'Required IAM role: "Vertex AI User" (roles/aiplatform.user)',
        projectId
          ? `Grant role: gcloud projects add-iam-policy-binding ${projectId} \\
    --member="serviceAccount:SA_EMAIL" --role="roles/aiplatform.user"`
          : 'Grant "Vertex AI User" role to your service account',
        'Verify service account email and project ID are correct',
      ],
    );
  }

  /**
   * Create error for API not enabled
   */
  static apiNotEnabled(projectId: string): AuthenticationError {
    return new AuthenticationError(
      AuthErrorCode.API_NOT_ENABLED,
      `Vertex AI API not enabled for project ${projectId}`,
      [
        `Enable API: gcloud services enable aiplatform.googleapis.com --project=${projectId}`,
        'Or visit: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com',
        'Wait a few minutes after enabling for changes to propagate',
      ],
    );
  }

  /**
   * Create error for network issues
   */
  static networkError(originalError?: Error): AuthenticationError {
    return new AuthenticationError(
      AuthErrorCode.NETWORK_ERROR,
      'Unable to reach Google Cloud authentication service',
      [
        'Check internet connectivity',
        'Verify firewall allows HTTPS to *.googleapis.com',
        'Check proxy configuration if applicable',
        'Try again in a few moments',
      ],
      originalError,
    );
  }

  /**
   * Map HTTP error codes to AuthenticationError
   */
  static fromHttpError(statusCode: number, projectId?: string): AuthenticationError {
    switch (statusCode) {
      case 401:
        return new AuthenticationError(
          AuthErrorCode.INVALID_CREDENTIALS,
          'Authentication failed: Invalid credentials',
          [
            'Verify credentials are correct and not expired',
            'For service accounts, ensure JSON key is valid',
            'For ADC, run: gcloud auth application-default login',
            'For API keys, verify key has not been revoked',
          ],
        );
      
      case 403:
        return AuthenticationError.permissionDenied(projectId);
      
      case 404:
        return projectId 
          ? AuthenticationError.apiNotEnabled(projectId)
          : new AuthenticationError(
              AuthErrorCode.API_NOT_ENABLED,
              'Resource not found - API may not be enabled',
              [
                'Verify Vertex AI API is enabled for your project',
                'Check resource name and project ID are correct',
              ],
            );
      
      default:
        return new AuthenticationError(
          AuthErrorCode.NETWORK_ERROR,
          `HTTP error ${statusCode}`,
          [
            'Check Google Cloud Status Dashboard for service issues',
            'Verify your request parameters are correct',
            'Try again in a few moments',
          ],
        );
    }
  }
}
