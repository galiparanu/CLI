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
import { VertexAI } from '@google-cloud/vertexai';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { ModelDispatcher } from '../services/modelDispatcher.js';
import { ModelService } from '../services/modelService.js';
import { loadPersona } from '../utils/persona.js';
import { retryWithBackoff } from '../utils/retry.js';
import { AuthenticationError, AuthErrorCode } from '../errors/AuthenticationError.js';
import { AuthMethodType } from '../auth/AuthMethodType.js';
import { AuthError as ModelAuthError } from '../auth/AuthError.js';
import type { ModelAuthAdapter } from '../auth/ModelAuthAdapter.js';

/**
 * Vertex AI implementation of ContentGenerator using @google-cloud/vertexai SDK.
 * Supports multi-model routing through ModelService and ModelDispatcher.
 */
export class VertexAiContentGenerator implements ContentGenerator {
  public userTier?: UserTierId;
  private modelService?: ModelService;
  private modelDispatcher?: ModelDispatcher;
  private persona: string;
  private useModelRouter: boolean;
  private defaultLocation: string;
  private project: string;
  private vertexAICache: Map<string, VertexAI> = new Map();

  constructor(
    project: string,
    location: string = 'us-central1',
    useModelRouter: boolean = false,
  ) {
    this.project = project;
    this.defaultLocation = location;
    this.useModelRouter = useModelRouter;
    this.persona = loadPersona();

    // Initialize ModelService and ModelDispatcher if model routing is enabled
    if (useModelRouter) {
      try {
        this.modelService = new ModelService();
        this.modelService.loadModels();
        this.modelDispatcher = new ModelDispatcher();
      } catch (error) {
        // If model service fails to load, continue without it
        console.warn('Failed to load model configuration:', error);
      }
    }
  }

  /**
   * Get or create a VertexAI instance for the specified location
   */
  private getVertexAIForLocation(location: string): VertexAI {
    const cacheKey = `${this.project}-${location}`;
    if (!this.vertexAICache.has(cacheKey)) {
      this.vertexAICache.set(cacheKey, new VertexAI({
        project: this.project,
        location: location,
      }));
    }
    return this.vertexAICache.get(cacheKey)!;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const fn = async () => {
      const { formattedRequest, location } = this.formatRequestForModel(request);
      
      // Check if we should use adapter-based authentication (e.g., OpenAPI for DeepSeek)
      const adapter = await this.getAdapterForModel(request.model, location);
      if (adapter) {
        return this.generateContentWithAdapter(adapter, formattedRequest, request.model, location);
      }

      // Before falling back to VertexAI SDK, check if model ID looks like it needs OpenAPI endpoint
      // Models with publisher/model format (e.g., "qwen/...") should use OpenAPI adapter, not VertexAI SDK
      if (formattedRequest.model.includes('/') && this.useModelRouter && this.modelService) {
        const modelConfig = this.modelService.getModel(request.model);
        if (modelConfig && modelConfig.api_type === 'openapi') {
          throw new Error(
            `Model ${request.model} requires OpenAPI endpoint but adapter was not found. ` +
            `Please ensure model routing is enabled and model configuration is correct. ` +
            `Model ID format "${formattedRequest.model}" is only supported via OpenAPI endpoints, not VertexAI SDK.`
          );
        }
      }

      // Fallback to standard VertexAI SDK
      const vertexAI = this.getVertexAIForLocation(location);

      const model = vertexAI.getGenerativeModel({
        model: formattedRequest.model,
        safetySettings: this.convertSafetySettings(
          formattedRequest.config?.safetySettings,
        ),
        generationConfig: (formattedRequest.config as any)?.generationConfig,
      });

      const result = await model.generateContent({
        contents: formattedRequest.contents as any,
        systemInstruction: formattedRequest.config?.systemInstruction as any,
      });

      // Convert Vertex AI response to match @google/genai format
      return result.response as unknown as GenerateContentResponse;
    };

    return retryWithBackoff(fn, {
      shouldRetryOnError: this.shouldRetry,
    });
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const { formattedRequest, location } = this.formatRequestForModel(request);
    
    // Check if we should use adapter-based authentication (e.g., OpenAPI for DeepSeek/Qwen)
    const adapter = await this.getAdapterForModel(request.model, location);
    if (adapter) {
      return this.generateContentStreamWithAdapter(adapter, formattedRequest, request.model, location);
    }

    // Before falling back to VertexAI SDK, check if model ID looks like it needs OpenAPI endpoint
    // Models with publisher/model format (e.g., "qwen/...") should use OpenAPI adapter, not VertexAI SDK
    if (formattedRequest.model.includes('/') && this.useModelRouter && this.modelService) {
      const modelConfig = this.modelService.getModel(request.model);
      if (modelConfig && modelConfig.api_type === 'openapi') {
        throw new Error(
          `Model ${request.model} requires OpenAPI endpoint but adapter was not found. ` +
          `Please ensure model routing is enabled and model configuration is correct. ` +
          `Model ID format "${formattedRequest.model}" is only supported via OpenAPI endpoints, not VertexAI SDK.`
        );
      }
    }

    const vertexAI = this.getVertexAIForLocation(location);

    // Check if this is a Claude model (Claude doesn't support streaming in Vertex AI)
    const isClaudeModel = formattedRequest.model.includes('claude');

    if (isClaudeModel) {
      // For Claude, use non-streaming API and convert to streaming format
      const model = vertexAI.getGenerativeModel({
        model: formattedRequest.model,
        safetySettings: this.convertSafetySettings(
          formattedRequest.config?.safetySettings,
        ),
        generationConfig: (formattedRequest.config as any)?.generationConfig,
      });

      const result = await model.generateContent({
        contents: formattedRequest.contents as any,
        systemInstruction: formattedRequest.config?.systemInstruction as any,
      });

      // Convert non-streaming response to streaming format
      const response = result.response as unknown as GenerateContentResponse;
      return (async function* () {
        yield response;
      })();
    }

    // For other models, use standard streaming
    const model = vertexAI.getGenerativeModel({
      model: formattedRequest.model,
      safetySettings: this.convertSafetySettings(
        formattedRequest.config?.safetySettings,
      ),
      generationConfig: (formattedRequest.config as any)?.generationConfig,
    });

    const streamResult = await model.generateContentStream({
      contents: formattedRequest.contents as any,
      systemInstruction: formattedRequest.config?.systemInstruction as any,
    });

    return (async function* () {
      for await (const chunk of streamResult.stream) {
        yield chunk as unknown as GenerateContentResponse;
      }
    })();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const fn = async () => {
      // For countTokens, we need to get location from model config
      // Create a minimal GenerateContentParameters to use formatRequestForModel
      const tempRequest: GenerateContentParameters = {
        model: request.model,
        contents: request.contents,
      };
      const { formattedRequest, location } = this.formatRequestForModel(tempRequest);
      const vertexAI = this.getVertexAIForLocation(location);
      const model = vertexAI.getGenerativeModel({
        model: formattedRequest.model,
      });

      const result = await model.countTokens({
        contents: request.contents as any,
      });

      return {
        totalTokens: result.totalTokens,
      } as CountTokensResponse;
    };

    return retryWithBackoff(fn, {
      shouldRetryOnError: this.shouldRetry,
    });
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const fn = async () => {
      // Vertex AI uses a different API for embeddings
      // We'll use the text-embedding model - this is a placeholder implementation
      const embeddings: Array<{ values: number[] }> = [];

      // Process each content item - handle both string and array formats
      const contentsArray = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];

      for (const _ of contentsArray) {
        // Note: embedContent API may not be available in all SDK versions
        // This is a placeholder implementation
        embeddings.push({ values: [] });
      }

      return {
        embeddings,
      } as EmbedContentResponse;
    };

    return retryWithBackoff(fn, {
      shouldRetryOnError: this.shouldRetry,
    });
  }

  /**
   * Formats the request based on the model configuration.
   * Uses ModelDispatcher to apply model-specific adapters and inject persona.
   * Returns formatted request and the location to use.
   */
  private formatRequestForModel(
    request: GenerateContentParameters,
  ): { formattedRequest: GenerateContentParameters; location: string } {
    const defaultResult = {
      formattedRequest: request,
      location: this.defaultLocation,
    };

    // If model routing is not enabled, just inject persona if available
    if (!this.useModelRouter || !this.modelService || !this.modelDispatcher) {
      if (this.persona && !request.config?.systemInstruction) {
        defaultResult.formattedRequest = {
          ...request,
          config: {
            ...request.config,
            systemInstruction: this.persona,
          },
        };
      }
      return defaultResult;
    }

    // Try to find the model configuration by alias
    const modelConfig = this.modelService.getModel(request.model);

    if (modelConfig) {
      // Use the dispatcher to format the request with the appropriate adapter
      const formattedRequest = this.modelDispatcher.formatRequest(modelConfig, request, this.persona);
      const location = modelConfig.region || this.defaultLocation;
      return { formattedRequest, location };
    }

    // If no model config found, treat it as a standard Gemini request
    // and inject persona if available
    if (this.persona && !request.config?.systemInstruction) {
      defaultResult.formattedRequest = {
        ...request,
        config: {
          ...request.config,
          systemInstruction: this.persona,
        },
      };
    }

    return defaultResult;
  }

  private convertSafetySettings(settings?: any): any {
    if (!settings) {
      return undefined;
    }

    // Convert @google/genai safety settings to Vertex AI format if needed
    return settings;
  }

  /**
   * Gets the appropriate adapter for a model if it uses adapter-based authentication.
   * Returns null if the model should use standard VertexAI SDK.
   */
  private async getAdapterForModel(
    modelAlias: string,
    location: string,
  ): Promise<ModelAuthAdapter | null> {
    // Only use adapters when model routing is enabled
    if (!this.useModelRouter) {
      if (process.env['DEBUG_MODEL_AUTH']) {
        console.debug(`[VertexAiContentGenerator] Model router disabled for ${modelAlias}`);
      }
      return null;
    }

    if (!this.modelService) {
      if (process.env['DEBUG_MODEL_AUTH']) {
        console.debug(`[VertexAiContentGenerator] ModelService not initialized for ${modelAlias}`);
      }
      return null;
    }

    try {
      const modelConfig = this.modelService.getModel(modelAlias);
      if (!modelConfig) {
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[VertexAiContentGenerator] Model config not found for ${modelAlias}`);
        }
        return null;
      }

      // Get auth config to determine if adapter should be used
      const authConfig = this.modelService.getModelConfig(modelAlias, this.project);
      
      if (process.env['DEBUG_MODEL_AUTH']) {
        console.debug(`[VertexAiContentGenerator] Model ${modelAlias} authMethod: ${authConfig.authMethod}, api_type: ${modelConfig.api_type}`);
      }
      
      // Use adapter for models with bearer_token auth
      // Different adapters for different API types:
      // - OpenAPI models (DeepSeek, Qwen) -> OpenAPIAdapter
      // - Vertex AI models (Gemini 2.5 Pro) -> VertexAIAdapter
      // - Claude models -> AnthropicAdapter
      if (authConfig.authMethod === AuthMethodType.BEARER_TOKEN) {
        const adapter = this.modelService.getAdapter(authConfig);
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[VertexAiContentGenerator] Using adapter for ${modelAlias} (${modelConfig.api_type})`);
        }
        return adapter;
      }

      // Use adapter for Claude SDK models (like Claude Sonnet 4.5)
      // Claude SDK adapter handles both authentication and request sending via Python SDK
      if (authConfig.authMethod === AuthMethodType.CLAUDE_SDK) {
        const adapter = this.modelService.getAdapter(authConfig);
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[VertexAiContentGenerator] Using Claude SDK adapter for ${modelAlias}`);
        }
        return adapter;
      }

      // Use adapter for Gemini SDK models (like Gemini 2.5 Pro)
      // Gemini SDK adapter handles both authentication and request sending via Python SDK
      if (authConfig.authMethod === AuthMethodType.GEMINI_SDK) {
        const adapter = this.modelService.getAdapter(authConfig);
        if (process.env['DEBUG_MODEL_AUTH']) {
          console.debug(`[VertexAiContentGenerator] Using Gemini SDK adapter for ${modelAlias}`);
        }
        return adapter;
      }

      if (process.env['DEBUG_MODEL_AUTH']) {
        console.debug(`[VertexAiContentGenerator] No adapter match for ${modelAlias} (authMethod: ${authConfig.authMethod})`);
      }
      return null;
    } catch (error) {
      // If adapter lookup fails, log error but don't throw
      console.warn(`[VertexAiContentGenerator] Failed to get adapter for model ${modelAlias}:`, error);
      if (process.env['DEBUG_MODEL_AUTH']) {
        console.debug(`[VertexAiContentGenerator] Error details:`, error instanceof Error ? error.stack : error);
      }
      return null;
    }
  }

  /**
   * Generates content using an adapter (e.g., OpenAPIAdapter for DeepSeek models).
   */
  private async generateContentWithAdapter(
    adapter: ModelAuthAdapter,
    formattedRequest: GenerateContentParameters,
    modelAlias: string,
    location: string,
  ): Promise<GenerateContentResponse> {
    if (!this.modelService) {
      throw new Error('ModelService not available');
    }

    const authConfig = this.modelService.getModelConfig(modelAlias, this.project);

    // Convert GenerateContentParameters to ModelRequest format
    const messages = (formattedRequest.contents as any[]).map((content) => {
      if (content.role) {
        return {
          role: content.role as 'user' | 'assistant' | 'system',
          content: content.parts?.map((p: any) => p.text || '').join('') || '',
        };
      }
      // Handle parts format
      return {
        role: 'user' as const,
        content: content.parts?.map((p: any) => p.text || '').join('') || '',
      };
    });

    const adapterRequest = {
      config: authConfig,
      messages,
      stream: false,
      maxTokens: (formattedRequest.config as any)?.generationConfig?.maxOutputTokens,
    };

    const adapterResponse = await adapter.sendRequest(adapterRequest);

    // Convert adapter response to GenerateContentResponse format
    return {
      candidates: [
        {
          content: {
            parts: [{ text: adapterResponse.content }],
            role: 'model',
          },
          finishReason: adapterResponse.stopReason || 'STOP',
        },
      ],
      modelVersion: formattedRequest.model,
    } as GenerateContentResponse;
  }

  /**
   * Generates streaming content using an adapter (e.g., OpenAPIAdapter for DeepSeek/Qwen models).
   */
  private async *generateContentStreamWithAdapter(
    adapter: ModelAuthAdapter,
    formattedRequest: GenerateContentParameters,
    modelAlias: string,
    location: string,
  ): AsyncGenerator<GenerateContentResponse, void, unknown> {
    if (!this.modelService) {
      throw new Error('ModelService not available');
    }

    const authConfig = this.modelService.getModelConfig(modelAlias, this.project);

    // Convert GenerateContentParameters to ModelRequest format
    const messages = (formattedRequest.contents as any[]).map((content) => {
      if (content.role) {
        return {
          role: content.role as 'user' | 'assistant' | 'system',
          content: content.parts?.map((p: any) => p.text || '').join('') || '',
        };
      }
      // Handle parts format
      return {
        role: 'user' as const,
        content: content.parts?.map((p: any) => p.text || '').join('') || '',
      };
    });

    // Check if adapter supports streaming
    if (adapter.supportsStreaming()) {
      // Use streaming request if adapter supports it
      // For OpenAPIAdapter, we need to use sendStreamingRequest method
      if ('sendStreamingRequest' in adapter && typeof (adapter as any).sendStreamingRequest === 'function') {
        const adapterRequest = {
          config: authConfig,
          messages,
          stream: true,
          maxTokens: (formattedRequest.config as any)?.generationConfig?.maxOutputTokens,
        };

        // Stream from adapter
        for await (const chunk of (adapter as any).sendStreamingRequest(adapterRequest)) {
          // Convert adapter response chunk to GenerateContentResponse format
          yield {
            candidates: [
              {
                content: {
                  parts: [{ text: chunk.content || '' }],
                  role: 'model',
                },
                finishReason: chunk.stopReason || undefined,
              },
            ],
            modelVersion: formattedRequest.model,
          } as GenerateContentResponse;
        }
        return;
      }
    }

    // Fallback to non-streaming if adapter doesn't support streaming
    const adapterRequest = {
      config: authConfig,
      messages,
      stream: false,
      maxTokens: (formattedRequest.config as any)?.generationConfig?.maxOutputTokens,
    };

    const adapterResponse = await adapter.sendRequest(adapterRequest);

    // Convert to streaming format (single chunk)
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: adapterResponse.content }],
            role: 'model',
          },
          finishReason: adapterResponse.stopReason || 'STOP',
        },
      ],
      modelVersion: formattedRequest.model,
    } as GenerateContentResponse;
  }

  private shouldRetry(error: Error): boolean {
    // Check for ModelAuthError (from adapters) with NETWORK_ERROR code
    // This includes rate limit (429) errors from AnthropicAdapter
    if (error instanceof ModelAuthError) {
      if (error.code === 'NETWORK_ERROR') {
        // Rate limit errors should be retried with exponential backoff
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return true;
        }
        // Other network errors should also be retried
        return true;
      }
    }
    
    if (error instanceof AuthenticationError) {
      return error.code === AuthErrorCode.NETWORK_ERROR;
    }
    
    // Check for rate limit in error message (fallback)
    if (error instanceof Error && 'message' in error) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        return true;
      }
    }
    
    // Check for 5xx server errors
    if ('code' in error && typeof error.code === 'number' && error.code >= 500) {
      return true;
    }
    return false;
  }
}
