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

/**
 * Vertex AI implementation of ContentGenerator using @google-cloud/vertexai SDK.
 * Supports multi-model routing through ModelService and ModelDispatcher.
 */
export class VertexAiContentGenerator implements ContentGenerator {
  private vertexAI: VertexAI;
  public userTier?: UserTierId;
  private modelService?: ModelService;
  private modelDispatcher?: ModelDispatcher;
  private persona: string;
  private useModelRouter: boolean;

  constructor(
    project: string,
    location: string = 'us-central1',
    useModelRouter: boolean = false,
  ) {
    this.vertexAI = new VertexAI({
      project,
      location,
    });
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

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const formattedRequest = this.formatRequestForModel(request);

    const model = this.vertexAI.getGenerativeModel({
      model: formattedRequest.model,
      safetySettings: this.convertSafetySettings(formattedRequest.config?.safetySettings),
      generationConfig: (formattedRequest.config as any)?.generationConfig,
    });

    const result = await model.generateContent({
      contents: formattedRequest.contents as any,
      systemInstruction: formattedRequest.config?.systemInstruction as any,
    });

    // Convert Vertex AI response to match @google/genai format
    return result.response as unknown as GenerateContentResponse;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const formattedRequest = this.formatRequestForModel(request);

    const model = this.vertexAI.getGenerativeModel({
      model: formattedRequest.model,
      safetySettings: this.convertSafetySettings(formattedRequest.config?.safetySettings),
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

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    const model = this.vertexAI.getGenerativeModel({
      model: request.model,
    });

    const result = await model.countTokens({
      contents: request.contents as any,
    });

    return {
      totalTokens: result.totalTokens,
    } as CountTokensResponse;
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
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
  }

  /**
   * Formats the request based on the model configuration.
   * Uses ModelDispatcher to apply model-specific adapters and inject persona.
   */
  private formatRequestForModel(
    request: GenerateContentParameters,
  ): GenerateContentParameters {
    // If model routing is not enabled, just inject persona if available
    if (!this.useModelRouter || !this.modelService || !this.modelDispatcher) {
      if (this.persona && !request.config?.systemInstruction) {
        return {
          ...request,
          config: {
            ...request.config,
            systemInstruction: this.persona,
          },
        };
      }
      return request;
    }

    // Try to find the model configuration by alias
    const modelConfig = this.modelService.getModel(request.model);
    
    if (modelConfig) {
      // Use the dispatcher to format the request with the appropriate adapter
      return this.modelDispatcher.formatRequest(modelConfig, request, this.persona);
    }

    // If no model config found, treat it as a standard Gemini request
    // and inject persona if available
    if (this.persona && !request.config?.systemInstruction) {
      return {
        ...request,
        config: {
          ...request.config,
          systemInstruction: this.persona,
        },
      };
    }

    return request;
  }

  private convertSafetySettings(settings?: any): any {
    if (!settings) {
      return undefined;
    }

    // Convert @google/genai safety settings to Vertex AI format if needed
    return settings;
  }
}
