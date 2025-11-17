/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import type { ValidationError, ValidationResult } from '@google/gemini-cli-core';
import { loadEnvironment, loadSettings } from './settings.js';
import * as fs from 'node:fs';

/**
 * Validate service account JSON file
 */
function validateServiceAccountFile(filePath: string): ValidationError | null {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    return {
      field: 'GOOGLE_APPLICATION_CREDENTIALS',
      message: `Service account file not found: ${filePath}`,
      remediationSteps: [
        'Verify the file path is correct',
        'Ensure the file has not been moved or deleted',
        'Use an absolute path to avoid relative path issues',
        'Download a new service account key from Google Cloud Console',
      ],
    };
  }

  // Check file is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    return {
      field: 'GOOGLE_APPLICATION_CREDENTIALS',
      message: `Service account file is not readable: ${filePath}`,
      remediationSteps: [
        'Check file permissions (should be at least 400)',
        `Run: chmod 600 ${filePath}`,
        'Ensure you have read access to the file',
      ],
    };
  }

  // Check JSON is valid
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);

    if (json.type !== 'service_account') {
      return {
        field: 'GOOGLE_APPLICATION_CREDENTIALS',
        message: 'File is not a valid service account JSON',
        remediationSteps: [
          'Verify you downloaded a service account key (not OAuth client)',
          'File should contain "type": "service_account"',
          'Download a new service account key from IAM & Admin > Service Accounts',
        ],
      };
    }

    // Check required fields
    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter((field) => !json[field]);
    
    if (missingFields.length > 0) {
      return {
        field: 'GOOGLE_APPLICATION_CREDENTIALS',
        message: `Service account JSON missing required fields: ${missingFields.join(', ')}`,
        remediationSteps: [
          'Verify the JSON file is complete',
          'Download a fresh service account key from Google Cloud Console',
        ],
      };
    }
  } catch (error) {
    return {
      field: 'GOOGLE_APPLICATION_CREDENTIALS',
      message: 'Service account JSON is malformed',
      remediationSteps: [
        'Verify file is valid JSON',
        'Check file is not corrupted',
        'Download a fresh service account key',
      ],
    };
  }

  return null; // Valid
}

/**
 * Validate GCP Project ID format
 */
function validateGCPProjectId(projectId: string): ValidationError | null {
  // GCP project IDs must:
  // - Be 6-30 characters
  // - Start with lowercase letter
  // - Contain only lowercase letters, numbers, and hyphens
  // - End with lowercase letter or number
  const projectIdPattern = /^[a-z]([a-z0-9-]{4,28}[a-z0-9])?$/;

  if (!projectIdPattern.test(projectId)) {
    return {
      field: 'GOOGLE_CLOUD_PROJECT',
      message: `Invalid GCP project ID format: ${projectId}`,
      remediationSteps: [
        'Project ID must be 6-30 characters',
        'Must start with a lowercase letter',
        'Can contain only lowercase letters, numbers, and hyphens',
        'Must end with a lowercase letter or number',
        'Check your project ID in Google Cloud Console',
      ],
    };
  }

  return null; // Valid
}

/**
 * Validate GCP region format
 */
function validateGCPRegion(region: string): ValidationError | null {
  // Allow 'global' or region pattern like 'us-central1', 'europe-west1', etc.
  const regionPattern = /^([a-z]+-[a-z]+\d+|global)$/;

  if (!regionPattern.test(region)) {
    return {
      field: 'GOOGLE_CLOUD_LOCATION',
      message: `Invalid GCP region format: ${region}`,
      remediationSteps: [
        'Region must be a valid GCP region (e.g., us-central1, europe-west1)',
        'Or use "global" for global endpoints',
        'See valid regions: https://cloud.google.com/vertex-ai/docs/general/locations',
      ],
    };
  }

  return null; // Valid
}

/**
 * Validate environment configuration for Vertex AI
 */
function validateEnvironmentConfig(authType: AuthType): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (authType !== AuthType.USE_VERTEX_AI) {
    return { valid: true, errors: [], warnings: [] };
  }

  const hasProjectConfig =
    !!process.env['GOOGLE_CLOUD_PROJECT'] &&
    !!process.env['GOOGLE_CLOUD_LOCATION'];
  const hasApiKey = !!process.env['GOOGLE_API_KEY'];
  const hasServiceAccount = !!process.env['GOOGLE_APPLICATION_CREDENTIALS'];

  // Must have either project config or API key
  if (!hasProjectConfig && !hasApiKey) {
    errors.push({
      field: 'GOOGLE_CLOUD_PROJECT',
      message: 'Missing required environment variables for Vertex AI',
      remediationSteps: [
        'When using Vertex AI, you must specify either:',
        '  • GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables',
        '  • GOOGLE_API_KEY environment variable (if using express mode)',
        'Update your .env file or export variables in your shell',
        'Example: export GOOGLE_CLOUD_PROJECT=your-project-id',
      ],
    });
  }

  // Validate project ID if present
  if (process.env['GOOGLE_CLOUD_PROJECT']) {
    const projectError = validateGCPProjectId(
      process.env['GOOGLE_CLOUD_PROJECT'],
    );
    if (projectError) {
      errors.push(projectError);
    }
  }

  // Validate region if present
  if (process.env['GOOGLE_CLOUD_LOCATION']) {
    const regionError = validateGCPRegion(process.env['GOOGLE_CLOUD_LOCATION']);
    if (regionError) {
      errors.push(regionError);
    }
  }

  // Validate service account file if specified
  if (hasServiceAccount) {
    const saPath = process.env['GOOGLE_APPLICATION_CREDENTIALS']!;
    const saError = validateServiceAccountFile(saPath);
    if (saError) {
      errors.push(saError);
    }
  }

  // Warn if multiple auth methods configured
  const authMethodsCount = [hasApiKey, hasServiceAccount].filter(Boolean).length;
  if (authMethodsCount > 1) {
    warnings.push(
      'Multiple authentication methods detected. Priority: API Key > Service Account > ADC',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAuthMethod(authMethod: string): string | null {
  loadEnvironment(loadSettings().merged);
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.COMPUTE_ADC
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const result = validateEnvironmentConfig(AuthType.USE_VERTEX_AI);
    
    if (!result.valid && result.errors && result.errors.length > 0) {
      // Format errors into a single message
      const errorMessages = result.errors.map((err: ValidationError) => {
        let msg = err.message;
        if (err.remediationSteps.length > 0) {
          msg += '\n' + err.remediationSteps.map((step: string) => `  • ${step}`).join('\n');
        }
        return msg;
      });
      
      return errorMessages.join('\n\n');
    }
    
    return null;
  }

  return 'Invalid auth method selected.';
}
