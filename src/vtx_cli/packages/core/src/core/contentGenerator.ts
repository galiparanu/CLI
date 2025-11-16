/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import type { Config } from '../config/config.js';
import { loadApiKey } from './apiKeyCredentialStorage.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import { VertexAiContentGenerator } from './vertexAiContentGenerator.js';
import { CredentialSource } from '../types/authentication.js';
import type { APIKeyProvider } from '../auth/APIKeyProvider.js';
import type { ServiceAccountProvider } from '../auth/ServiceAccountProvider.js';
import type { GoogleCredentialProvider } from '../mcp/google-auth-provider.js';
import { debugLogger } from '../utils/debugLogger.js';
import { redact } from '../utils/redact.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
  project?: string;
  location?: string;
  credentialSource?: CredentialSource;
};

function getEnv(key: string): string | undefined {
  const value = process.env[key];
  return !value || value.trim() === '' ? undefined : value;
}

// Keep track of the last detected environment variables
let lastEnv: NodeJS.ProcessEnv | null = null;

// Cache for credential providers
const providerCache = new Map<
  string,
  APIKeyProvider | ServiceAccountProvider | GoogleCredentialProvider
>();

/**
 * Clear credential provider cache if environment variables have changed
 */
function checkAndClearCache() {
  if (lastEnv && JSON.stringify(process.env) !== JSON.stringify(lastEnv)) {
    debugLogger.debug(
      'Environment variables changed, clearing credential cache.',
    );
    providerCache.forEach(provider => provider.clearCredentials());
    providerCache.clear();
  }
  lastEnv = { ...process.env };
}

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
  credentialSource?: CredentialSource,
): Promise<ContentGeneratorConfig> {
  checkAndClearCache();

  const geminiApiKey = (await loadApiKey()) || getEnv('GEMINI_API_KEY');
  const googleApiKey = getEnv('GOOGLE_API_KEY');
  const googleCloudProject =
    getEnv('GOOGLE_CLOUD_PROJECT') || getEnv('GOOGLE_CLOUD_PROJECT_ID');
  const googleCloudLocation = getEnv('GOOGLE_CLOUD_LOCATION');

  const contentGeneratorConfig: ContentGeneratorConfig = {
    authType,
    proxy: config?.getProxy(),
    credentialSource,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.COMPUTE_ADC
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || googleCloudProject || credentialSource)
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.project = googleCloudProject;
    contentGeneratorConfig.location = googleCloudLocation || 'us-central1';

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponses) {
      return FakeContentGenerator.fromFile(gcConfig.fakeResponses);
    }
    const version = process.env['CLI_VERSION'] || process.version;
    const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
    const baseHeaders: Record<string, string> = {
      'User-Agent': userAgent,
    };
    if (
      config.authType === AuthType.LOGIN_WITH_GOOGLE ||
      config.authType === AuthType.COMPUTE_ADC
    ) {
      const httpOptions = { headers: baseHeaders };
      return new LoggingContentGenerator(
        await createCodeAssistContentGenerator(
          httpOptions,
          config.authType,
          gcConfig,
          sessionId,
        ),
        gcConfig,
      );
    }

    if (
      config.authType === AuthType.USE_GEMINI ||
      config.authType === AuthType.USE_VERTEX_AI
    ) {
      let headers: Record<string, string> = { ...baseHeaders };
      if (gcConfig?.getUsageStatisticsEnabled()) {
        const installationManager = new InstallationManager();
        const installationId = installationManager.getInstallationId();
        headers = {
          ...headers,
          'x-gemini-api-privileged-user-id': `${installationId}`,
        };
      }
      const httpOptions = { headers };

      // Use native Vertex AI SDK when vertexai flag is true and project is configured
      if (config.vertexai && (config.project || config.credentialSource)) {
        let provider:
          | APIKeyProvider
          | ServiceAccountProvider
          | GoogleCredentialProvider
          | undefined;
        let auth: GoogleAuth | undefined;

        if (config.credentialSource) {
          const cacheKey = `${config.credentialSource}:${process.env['GOOGLE_APPLICATION_CREDENTIALS']}`;
          if (providerCache.has(cacheKey)) {
            provider = providerCache.get(cacheKey);
          } else {
            switch (config.credentialSource) {
              case CredentialSource.API_KEY:
                if (config.apiKey) {
                  provider = new APIKeyProvider(config.apiKey);
                  auth = new GoogleAuth({
                    authOptions: { apiKey: config.apiKey },
                  });
                }
                break;
              case CredentialSource.SERVICE_ACCOUNT_FILE:
                if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
                  const saPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
                  provider = new ServiceAccountProvider(saPath);
                  auth = new GoogleAuth({
                    keyFilename: saPath,
                    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
                  });
                }
                break;
              case CredentialSource.ADC_GCLOUD:
              case CredentialSource.COMPUTE_METADATA: {
                const mcpConfig = gcConfig.getMcpConfig();
                if (mcpConfig) {
                  provider = new GoogleCredentialProvider(mcpConfig);
                  auth = new GoogleAuth({
                    scopes: mcpConfig.oauth?.scopes,
                  });
                }
                break;
              }
            }
            if
