/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'yaml';
import { AuthMethodType, parseAuthMethod, isValidAuthMethod } from '../auth/AuthMethodType.js';
import { AuthError } from '../auth/AuthError.js';
import type { ModelAuthAdapter } from '../auth/ModelAuthAdapter.js';
import { OpenAPIAdapter } from '../auth/adapters/openapi-adapter.js';
import { AnthropicAdapter } from '../auth/adapters/anthropic-adapter.js';
import { ClaudeSDKAdapter } from '../auth/adapters/claude-sdk-adapter.js';
import { GeminiSDKAdapter } from '../auth/adapters/gemini-sdk-adapter.js';
import { VertexAIAdapter } from '../auth/adapters/vertex-ai-adapter.js';
import { debugLogger } from '../utils/debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Represents a model configuration entry.
 */
export interface ModelConfig {
  name: string;
  endpoint_id: string;
  adapter: 'gemini' | 'claude';
  region?: string;
  endpoint?: string;
  api_type?: 'vertex' | 'openapi';
  auth_method?: string;
}

/**
 * Represents the authentication configuration for a specific model.
 * Extends ModelConfig with parsed authMethod and additional fields.
 */
export interface ModelAuthConfig extends ModelConfig {
  /** The model alias from models.yaml */
  modelAlias: string;
  /** The parsed authentication method to use */
  authMethod: AuthMethodType;
  /** Google Cloud project ID */
  projectId: string;
  /** The actual model identifier */
  modelId: string;
}

/**
 * Map of model aliases to their configurations.
 */
export type ModelsConfig = Record<string, ModelConfig>;

/**
 * Validation result for model configuration.
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Actionable steps to fix the issue */
  actionableSteps?: string[];
}

/**
 * Service for loading and managing model configurations from models.yaml.
 */
export class ModelService {
  private models: ModelsConfig = {};
  private configPath: string;

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath;
    } else {
      // Try multiple possible locations for models.yaml
      const possiblePaths = [
        // In the workspace root (when running from vtx_cli/)
        path.join(process.cwd(), 'configs', 'models.yaml'),
        // In parent directory (when running from vtx_cli/packages/cli/)
        path.join(process.cwd(), '..', '..', 'configs', 'models.yaml'),
        // Relative to this file (packages/core/src/services/)
        path.join(__dirname, '..', '..', '..', '..', 'configs', 'models.yaml'),
        // In the src/vtx_cli directory
        path.join(__dirname, '..', '..', '..', '..', '..', '..', 'src', 'vtx_cli', 'configs', 'models.yaml'),
      ];

      // Find the first path that exists
      let foundPath = '';
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          foundPath = testPath;
          break;
        }
      }

      // Use found path or default to first one
      this.configPath = foundPath || possiblePaths[0];
    }
  }

  /**
   * Loads the models configuration from the YAML file.
   * @throws Error if the file cannot be read or parsed.
   */
  loadModels(): void {
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      this.models = yaml.parse(fileContent) as ModelsConfig;
    } catch (error) {
      throw new Error(
        `Failed to load models configuration from ${this.configPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Gets the configuration for a specific model by alias.
   * @param alias The model alias (e.g., 'claude', 'gemini')
   * @returns The model configuration or undefined if not found
   */
  getModel(alias: string): ModelConfig | undefined {
    return this.models[alias];
  }

  /**
   * Gets all available model aliases.
   * @returns Array of model aliases
   */
  getAvailableAliases(): string[] {
    return Object.keys(this.models);
  }

  /**
   * Checks if a model alias exists in the configuration.
   * @param alias The model alias to check
   * @returns true if the model exists, false otherwise
   */
  hasModel(alias: string): boolean {
    return alias in this.models;
  }

  /**
   * Gets all models configuration.
   * @returns The complete models configuration
   */
  getAllModels(): ModelsConfig {
    return { ...this.models };
  }

  /**
   * Gets the authentication configuration for a specific model by alias.
   * Loads and parses auth_method from models.yaml.
   * @param alias The model alias (e.g., 'deepseek-v3', 'claude-sonnet')
   * @param projectId The Google Cloud project ID
   * @returns The model authentication configuration
   * @throws AuthError if the model is not found or configuration is invalid
   */
  getModelConfig(alias: string, projectId: string): ModelAuthConfig {
    // Ensure models are loaded
    if (Object.keys(this.models).length === 0) {
      this.loadModels();
    }

    const model = this.models[alias];
    if (!model) {
      throw AuthError.invalidConfig(
        `Model alias '${alias}' not found`,
        [
          `Available models: ${this.getAvailableAliases().join(', ')}`,
          'Check models.yaml for valid model aliases',
        ],
      );
    }

    // Parse auth_method
    const authMethodStr = model.auth_method || 'bearer_token';
    if (!isValidAuthMethod(authMethodStr)) {
      throw AuthError.invalidConfig(
        `Invalid auth_method '${authMethodStr}' for model '${alias}'`,
        [
          `Valid auth_method values: ${Object.values(AuthMethodType).join(', ')}`,
          'Update models.yaml with a valid auth_method',
        ],
      );
    }

    const authMethod = parseAuthMethod(authMethodStr);

    // Validate required fields
    if (!model.endpoint_id) {
      throw AuthError.invalidConfig(
        `Missing endpoint_id for model '${alias}'`,
        ['Add endpoint_id field to model configuration in models.yaml'],
      );
    }

    if (!projectId || projectId.trim().length === 0) {
      throw AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT');
    }

    return {
      ...model,
      modelAlias: alias,
      authMethod,
      projectId,
      modelId: model.endpoint_id,
    };
  }

  private adapters: Map<string, ModelAuthAdapter> = new Map();

  /**
   * Gets the appropriate adapter for a model's authentication method.
   * @param config Model authentication configuration
   * @returns ModelAuthAdapter instance
   * @throws AuthError if adapter cannot be created
   */
  getAdapter(config: ModelAuthConfig): ModelAuthAdapter {
    const key = `${config.modelAlias}-${config.authMethod}`;

    // Return cached adapter if available
    if (this.adapters.has(key)) {
      const cachedAdapter = this.adapters.get(key)!;
      debugLogger.debug(
        `[ModelService] Using cached adapter for ${config.modelAlias} (${config.authMethod})`,
      );
      return cachedAdapter;
    }

    debugLogger.debug(
      `[ModelService] Creating new adapter for ${config.modelAlias} with auth method: ${config.authMethod}`,
    );

    let adapter: ModelAuthAdapter;

    switch (config.authMethod) {
      case AuthMethodType.BEARER_TOKEN: {
        // Use AnthropicAdapter for Claude models with bearer_token auth
        // Anthropic uses a different endpoint format than OpenAPI
        if (config.adapter === 'claude' || config.modelAlias.includes('claude')) {
          adapter = new AnthropicAdapter();
          debugLogger.debug(
            `[ModelService] Created AnthropicAdapter for ${config.modelAlias}`,
          );
        } else if (config.api_type === 'vertex') {
          // Use VertexAIAdapter for Vertex AI models (like Gemini 2.5 Pro)
          // These use /publishers/google/models endpoint format
          adapter = new VertexAIAdapter();
          debugLogger.debug(
            `[ModelService] Created VertexAIAdapter for ${config.modelAlias}`,
          );
        } else {
          // Use OpenAPIAdapter for OpenAPI models (like DeepSeek, Qwen)
          adapter = new OpenAPIAdapter();
          debugLogger.debug(
            `[ModelService] Created OpenAPIAdapter for ${config.modelAlias}`,
          );
        }
        break;
      }
      case AuthMethodType.CLAUDE_SDK: {
        // Get Python path from config or use default
        const pythonPath = process.env['PYTHON_PATH'] || 'python3';
        adapter = new ClaudeSDKAdapter(pythonPath);
        debugLogger.debug(
          `[ModelService] Created ClaudeSDKAdapter for ${config.modelAlias} (Python: ${pythonPath})`,
        );
        break;
      }
      case AuthMethodType.GEMINI_SDK: {
        // Get Python path from config or use default
        const pythonPath = process.env['PYTHON_PATH'] || 'python3';
        adapter = new GeminiSDKAdapter(pythonPath);
        debugLogger.debug(
          `[ModelService] Created GeminiSDKAdapter for ${config.modelAlias} (Python: ${pythonPath})`,
        );
        break;
      }
      default:
        throw AuthError.invalidConfig(
          `Unknown auth method: ${config.authMethod}`,
          [
            `Valid auth methods: ${Object.values(AuthMethodType).join(', ')}`,
          ],
        );
    }

    // Cache the adapter
    this.adapters.set(key, adapter);
    return adapter;
  }

  /**
   * Validates a ModelAuthConfig.
   * @param config Model authentication configuration to validate
   * @returns Validation result
   */
  validateConfig(config: ModelAuthConfig): ValidationResult {
    try {
      // Validate modelAlias
      if (!config.modelAlias || config.modelAlias.trim().length === 0) {
        return {
          valid: false,
          error: 'Model alias is required',
          actionableSteps: ['Provide a valid model alias'],
        };
      }

      // Validate authMethod
      if (!Object.values(AuthMethodType).includes(config.authMethod)) {
        return {
          valid: false,
          error: `Invalid auth method: ${config.authMethod}`,
          actionableSteps: [
            `Use one of: ${Object.values(AuthMethodType).join(', ')}`,
          ],
        };
      }

      // Validate projectId
      if (!config.projectId || config.projectId.trim().length === 0) {
        return {
          valid: false,
          error: 'Project ID is required',
          actionableSteps: [
            'Set GOOGLE_CLOUD_PROJECT environment variable',
            'Or provide projectId in configuration',
          ],
        };
      }

      // Validate GOOGLE_CLOUD_PROJECT environment variable if not provided in config
      if (!process.env['GOOGLE_CLOUD_PROJECT'] && !config.projectId) {
        return {
          valid: false,
          error: 'GOOGLE_CLOUD_PROJECT environment variable is not set',
          actionableSteps: [
            'Set GOOGLE_CLOUD_PROJECT environment variable: export GOOGLE_CLOUD_PROJECT=your-project-id',
            'Or provide projectId when calling getModelConfig()',
            'Verify your gcloud configuration: gcloud config get-value project',
          ],
        };
      }

      // Validate modelId
      if (!config.modelId || config.modelId.trim().length === 0) {
        return {
          valid: false,
          error: 'Model ID is required',
          actionableSteps: ['Add endpoint_id field to model configuration'],
        };
      }

      // Validate region based on auth method
      if (!config.region || config.region.trim().length === 0) {
        return {
          valid: false,
          error: 'Region is required',
          actionableSteps: ['Add region field to model configuration'],
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        actionableSteps: ['Check configuration format'],
      };
    }
  }
}
