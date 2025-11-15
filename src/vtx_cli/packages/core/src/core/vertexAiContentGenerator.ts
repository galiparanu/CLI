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
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';

/**
 * Vertex AI implementation of ContentGenerator using @google-cloud/vertexai SDK.
 */
export class VertexAiContentGenerator implements ContentGenerator {
  private vertexAI: VertexAI;
  public userTier?: UserTierId;

  constructor(
    project: string,
    location: string = 'us-central1',
  ) {
    this.vertexAI = new VertexAI({
      project,
      location,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const model = this.vertexAI.getGenerativeModel({
      model: request.model,
      safetySettings: this.convertSafetySettings(request.config?.safetySettings),
      generationConfig: request.config?.generationConfig,
    });

    const result = await model.generateContent({
      contents: request.contents,
      systemInstruction: request.config?.systemInstruction,
    });

    // Convert Vertex AI response to match @google/genai format
    return result.response as unknown as GenerateContentResponse;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const model = this.vertexAI.getGenerativeModel({
      model: request.model,
      safetySettings: this.convertSafetySettings(request.config?.safetySettings),
      generationConfig: request.config?.generationConfig,
    });

    const streamResult = await model.generateContentStream({
      contents: request.contents,
      systemInstruction: request.config?.systemInstruction,
    });

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
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
      contents: request.contents,
    });

    return {
      totalTokens: result.totalTokens,
    } as CountTokensResponse;
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Vertex AI uses a different API for embeddings
    // We'll use the text-embedding model
    const model = this.vertexAI.preview.getGenerativeModel({
      model: 'text-embedding-004',
    });

    const embeddings: Array<{ values: number[] }> = [];
    
    // Process each content item
    for (const content of request.contents) {
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      const result = await model.embedContent(text);
      
      if (result.embeddings && result.embeddings[0]) {
        embeddings.push({ values: result.embeddings[0].values });
      }
    }

    return {
      embeddings,
    } as EmbedContentResponse;
  }

  private convertSafetySettings(settings?: any): any {
    if (!settings) {
      return undefined;
    }

    // Convert @google/genai safety settings to Vertex AI format if needed
    return settings;
  }
}
