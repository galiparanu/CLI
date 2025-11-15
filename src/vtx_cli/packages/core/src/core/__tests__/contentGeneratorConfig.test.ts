/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createContentGeneratorConfig,
  AuthType,
} from '../contentGenerator.js';

describe('Content Generator Configuration', () => {
  describe('createContentGeneratorConfig', () => {
    it('should create config for USE_VERTEX_AI auth type with project and location', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      // Set environment variables for the test
      const originalProject = process.env['GOOGLE_CLOUD_PROJECT'];
      const originalLocation = process.env['GOOGLE_CLOUD_LOCATION'];
      
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project-123';
      process.env['GOOGLE_CLOUD_LOCATION'] = 'us-west1';

      const config = await createContentGeneratorConfig(
        mockConfig,
        AuthType.USE_VERTEX_AI,
      );

      expect(config).toBeDefined();
      expect(config.authType).toBe(AuthType.USE_VERTEX_AI);
      expect(config.vertexai).toBe(true);
      expect(config.project).toBe('test-project-123');
      expect(config.location).toBe('us-west1');

      // Restore original values
      if (originalProject) {
        process.env['GOOGLE_CLOUD_PROJECT'] = originalProject;
      } else {
        delete process.env['GOOGLE_CLOUD_PROJECT'];
      }
      if (originalLocation) {
        process.env['GOOGLE_CLOUD_LOCATION'] = originalLocation;
      } else {
        delete process.env['GOOGLE_CLOUD_LOCATION'];
      }
    });

    it('should default location to us-central1 if not specified', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      const originalProject = process.env['GOOGLE_CLOUD_PROJECT'];
      const originalLocation = process.env['GOOGLE_CLOUD_LOCATION'];

      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project-456';
      delete process.env['GOOGLE_CLOUD_LOCATION'];

      const config = await createContentGeneratorConfig(
        mockConfig,
        AuthType.USE_VERTEX_AI,
      );

      expect(config.location).toBe('us-central1');

      // Restore original values
      if (originalProject) {
        process.env['GOOGLE_CLOUD_PROJECT'] = originalProject;
      } else {
        delete process.env['GOOGLE_CLOUD_PROJECT'];
      }
      if (originalLocation) {
        process.env['GOOGLE_CLOUD_LOCATION'] = originalLocation;
      }
    });

    it('should create config for USE_GEMINI auth type', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      const originalApiKey = process.env['GEMINI_API_KEY'];

      process.env['GEMINI_API_KEY'] = 'test-api-key';

      const config = await createContentGeneratorConfig(
        mockConfig,
        AuthType.USE_GEMINI,
      );

      expect(config).toBeDefined();
      expect(config.authType).toBe(AuthType.USE_GEMINI);
      expect(config.vertexai).toBe(false);
      expect(config.apiKey).toBe('test-api-key');

      // Restore original value
      if (originalApiKey) {
        process.env['GEMINI_API_KEY'] = originalApiKey;
      } else {
        delete process.env['GEMINI_API_KEY'];
      }
    });
  });
});
