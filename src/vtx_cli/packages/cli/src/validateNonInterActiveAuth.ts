/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { AuthType, debugLogger, OutputFormat, CredentialSource, AuthenticationError, AuthErrorCode } from '@google/gemini-cli-core';
import { USER_SETTINGS_PATH } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';
import { type LoadedSettings } from './config/settings.js';
import { handleError } from './utils/errors.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Detect the credential source based on environment configuration
 * Priority: API Key > Service Account > ADC > Compute Metadata
 * @returns Detected credential source or null if none found
 */
function detectCredentialSource(): CredentialSource | null {
  const detectedSources: CredentialSource[] = [];

  // Check all possible sources
  if (process.env['GOOGLE_API_KEY']) {
    detectedSources.push(CredentialSource.API_KEY);
  }

  const saPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  if (saPath && fs.existsSync(saPath)) {
    detectedSources.push(CredentialSource.SERVICE_ACCOUNT_FILE);
  }

  const adcPath = path.join(
    os.homedir(),
    '.config',
    'gcloud',
    'application_default_credentials.json',
  );
  if (fs.existsSync(adcPath)) {
    detectedSources.push(CredentialSource.ADC_GCLOUD);
  }

  if (
    process.env['GCE_METADATA_HOST'] ||
    process.env['KUBERNETES_SERVICE_HOST']
  ) {
    detectedSources.push(CredentialSource.COMPUTE_METADATA);
  }

  // Handle multiple methods configured
  if (detectedSources.length > 1) {
    debugLogger.debug(
      `Multiple credential sources detected: ${detectedSources.join(
        ', ',
      )}. Using priority order.`,
    );
  }

  // Return highest priority source (already in priority order)
  if (detectedSources.length > 0) {
    const selectedSource = detectedSources[0];
    debugLogger.debug(`Selected credential source: ${selectedSource}`);
    return selectedSource;
  }

  // No credential source found
  debugLogger.debug('No credential source detected');
  return null;
}

function getAuthTypeFromEnv(): AuthType | undefined {
  if (process.env['GOOGLE_GENAI_USE_GCA'] === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
    const credSource = detectCredentialSource();
    
    // Handle case where no credentials are configured
    if (!credSource && !process.env['GOOGLE_API_KEY']) {
      const hasProjectConfig = !!process.env['GOOGLE_CLOUD_PROJECT'];
      
      if (hasProjectConfig) {
        // Project configured but no credentials found
        throw new AuthenticationError(
          AuthErrorCode.MISSING_ENV,
          'No credentials found for Vertex AI authentication',
          [
            'Vertex AI requires one of the following:',
            '  • GOOGLE_API_KEY environment variable (for API key authentication)',
            '  • GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON file',
            '  • Application Default Credentials via: gcloud auth application-default login',
            '  • Running on GCE/GKE with default service account',
            'Configure credentials and try again',
          ],
        );
      }
    }
    
    if (credSource) {
      debugLogger.debug(
        `Using Vertex AI with credential source: ${credSource}`,
      );
    }
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env['GEMINI_API_KEY']) {
    return AuthType.USE_GEMINI;
  }
  return undefined;
}

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
  settings: LoadedSettings,
) {
  try {
    const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

    const enforcedType = settings.merged.security?.auth?.enforcedType;
    if (enforcedType && effectiveAuthType !== enforcedType) {
      const message = effectiveAuthType
        ? `The enforced authentication type is '${enforcedType}', but the current type is '${effectiveAuthType}'. Please re-authenticate with the correct type.`
        : `The auth type '${enforcedType}' is enforced, but no authentication is configured.`;
      throw new Error(message);
    }

    if (!effectiveAuthType) {
      const message = `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`;
      throw new Error(message);
    }

    const authType: AuthType = effectiveAuthType as AuthType;

    if (!useExternalAuth) {
      const err = validateAuthMethod(String(authType));
      if (err != null) {
        throw new Error(err);
      }
    }

    await nonInteractiveConfig.refreshAuth(authType);
    return nonInteractiveConfig;
  } catch (error) {
    if (nonInteractiveConfig.getOutputFormat() === OutputFormat.JSON) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        nonInteractiveConfig,
        1,
      );
    } else {
      debugLogger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}
