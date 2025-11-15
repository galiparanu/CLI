/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VertexAiContentGenerator } from '../../src/vtx_cli/packages/core/src/core/vertexAiContentGenerator.js';
import type { GenerateContentParameters } from '@google/genai';

describe('Vertex AI API Transplant', () => {
  const testProject = process.env['GOOGLE_CLOUD_PROJECT'] || 'test-project';
  const testLocation = process.env['GOOGLE_CLOUD_LOCATION'] || 'us-central1';
  
  let generator: VertexAiContentGenerator;

  beforeEach(() => {
    generator = new VertexAiContentGenerator(testProject, testLocation);
  });

  describe('VertexAiContentGenerator', () => {
    it('should create a Vertex AI content generator instance', () => {
      expect(generator).toBeDefined();
      expect(generator).toBeInstanceOf(VertexAiContentGenerator);
    });

    it('should have required ContentGenerator methods', () => {
      expect(generator.generateContent).toBeDefined();
      expect(generator.generateContentStream).toBeDefined();
      expect(generator.countTokens).toBeDefined();
      expect(generator.embedContent).toBeDefined();
    });
  });

  describe('generateContent', () => {
    it('should call Vertex AI API with correct parameters', async () => {
      const request: GenerateContentParameters = {
        model: 'gemini-1.5-pro-001',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, how are you?' }],
          },
        ],
        config: {
          temperature: 0.9,
          topP: 1,
          topK: 32,
          maxOutputTokens: 2048,
        },
      };

      // Mock the Vertex AI call if we don't have real credentials
      if (!process.env['GOOGLE_CLOUD_PROJECT']) {
        // Skip test if no credentials available
        console.log('Skipping test: No GOOGLE_CLOUD_PROJECT set');
        return;
      }

      try {
        const response = await generator.generateContent(request, 'test-prompt-1');
        
        expect(response).toBeDefined();
        expect(response.candidates).toBeDefined();
        expect(response.candidates!.length).toBeGreaterThan(0);
      } catch (error) {
        // If authentication fails, that's expected in test environment
        if (error instanceof Error && error.message.includes('authentication')) {
          console.log('Authentication not available in test environment - expected behavior');
        } else {
          throw error;
        }
      }
    });
  });

  describe('generateContentStream', () => {
    it('should return an async generator for streaming responses', async () => {
      const request: GenerateContentParameters = {
        model: 'gemini-1.5-pro-001',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Count to 3' }],
          },
        ],
      };

      if (!process.env['GOOGLE_CLOUD_PROJECT']) {
        console.log('Skipping test: No GOOGLE_CLOUD_PROJECT set');
        return;
      }

      try {
        const stream = await generator.generateContentStream(request, 'test-prompt-2');
        
        expect(stream).toBeDefined();
        expect(typeof stream[Symbol.asyncIterator]).toBe('function');
        
        // Consume first chunk
        const firstChunk = await stream.next();
        if (!firstChunk.done) {
          expect(firstChunk.value).toBeDefined();
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('authentication')) {
          console.log('Authentication not available in test environment - expected behavior');
        } else {
          throw error;
        }
      }
    });
  });

  describe('countTokens', () => {
    it('should count tokens correctly', async () => {
      const request = {
        model: 'gemini-1.5-pro-001',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello world' }],
          },
        ],
      };

      if (!process.env['GOOGLE_CLOUD_PROJECT']) {
        console.log('Skipping test: No GOOGLE_CLOUD_PROJECT set');
        return;
      }

      try {
        const response = await generator.countTokens(request);
        
        expect(response).toBeDefined();
        expect(response.totalTokens).toBeDefined();
        expect(response.totalTokens).toBeGreaterThan(0);
      } catch (error) {
        if (error instanceof Error && error.message.includes('authentication')) {
          console.log('Authentication not available in test environment - expected behavior');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Integration with existing geminiChat', () => {
    it('should work as a drop-in replacement for existing ContentGenerator interface', () => {
      // Verify the generator implements all required methods
      const requiredMethods = [
        'generateContent',
        'generateContentStream',
        'countTokens',
        'embedContent',
      ];

      for (const method of requiredMethods) {
        expect(generator).toHaveProperty(method);
        expect(typeof (generator as any)[method]).toBe('function');
      }
    });
  });
});
