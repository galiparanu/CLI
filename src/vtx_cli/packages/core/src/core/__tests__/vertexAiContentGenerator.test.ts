/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { VertexAiContentGenerator } from '../vertexAiContentGenerator.js';

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
