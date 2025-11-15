/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  Content,
  Part,
} from '@google/genai';
import type { ModelConfig } from './modelService.js';

/**
 * Adapter function type for formatting API requests based on model requirements.
 */
export type ModelAdapter = (
  request: GenerateContentParameters,
  persona: string,
) => GenerateContentParameters;

/**
 * Gemini adapter - handles Gemini-like request formats.
 * This is used for Gemini, Qwen, DeepSeek, and other compatible models.
 */
export function geminiAdapter(
  request: GenerateContentParameters,
  persona: string,
): GenerateContentParameters {
  const adaptedRequest = { ...request };

  // Inject persona as system instruction if provided
  if (persona) {
    adaptedRequest.config = {
      ...adaptedRequest.config,
      systemInstruction: persona,
    };
  }

  return adaptedRequest;
}

/**
 * Claude adapter - handles Claude-specific request formats.
 * Claude uses Anthropic's API structure which differs from Gemini.
 */
export function claudeAdapter(
  request: GenerateContentParameters,
  persona: string,
): GenerateContentParameters {
  const adaptedRequest = { ...request };

  // For Claude, we need to inject the persona into the content history
  // as it may have different system instruction handling
  if (persona && adaptedRequest.contents) {
    // Create a system message part
    const systemPart: Part = { text: persona };
    const systemContent: Content = {
      role: 'user',
      parts: [systemPart],
    };

    // Prepend the system instruction as the first user message
    // This ensures Claude sees it as context for the conversation
    const contentsArray = Array.isArray(adaptedRequest.contents)
      ? adaptedRequest.contents
      : [adaptedRequest.contents];
    adaptedRequest.contents = [systemContent, ...contentsArray] as any;
  } else if (persona) {
    // If no contents yet, set it up with the persona
    adaptedRequest.config = {
      ...adaptedRequest.config,
      systemInstruction: persona,
    };
  }

  return adaptedRequest;
}

/**
 * ModelDispatcher handles routing and formatting requests to different models.
 */
export class ModelDispatcher {
  private adapters: Map<string, ModelAdapter>;

  constructor() {
    this.adapters = new Map();
    // Register built-in adapters
    this.adapters.set('gemini', geminiAdapter);
    this.adapters.set('claude', claudeAdapter);
  }

  /**
   * Registers a custom adapter for a specific adapter name.
   */
  registerAdapter(name: string, adapter: ModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * Formats an API request based on the model's adapter.
   */
  formatRequest(
    modelConfig: ModelConfig,
    request: GenerateContentParameters,
    persona: string = '',
  ): GenerateContentParameters {
    const adapter = this.adapters.get(modelConfig.adapter);
    
    if (!adapter) {
      throw new Error(
        `No adapter found for '${modelConfig.adapter}'. Available adapters: ${Array.from(this.adapters.keys()).join(', ')}`,
      );
    }

    // Apply the adapter to format the request
    const formattedRequest = adapter(request, persona);

    // Update the model to use the endpoint_id from the config
    formattedRequest.model = modelConfig.endpoint_id;

    return formattedRequest;
  }

  /**
   * Gets the list of available adapter names.
   */
  getAvailableAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
