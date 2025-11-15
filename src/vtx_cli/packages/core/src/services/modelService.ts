/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

/**
 * Represents a model configuration entry.
 */
export interface ModelConfig {
  name: string;
  endpoint_id: string;
  adapter: 'gemini' | 'claude';
}

/**
 * Map of model aliases to their configurations.
 */
export type ModelsConfig = Record<string, ModelConfig>;

/**
 * Service for loading and managing model configurations from models.yaml.
 */
export class ModelService {
  private models: ModelsConfig = {};
  private configPath: string;

  constructor(configPath?: string) {
    // Default to configs/models.yaml in the project root
    this.configPath = configPath || path.join(process.cwd(), 'configs', 'models.yaml');
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
}
