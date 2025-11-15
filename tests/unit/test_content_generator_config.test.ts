/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createContentGeneratorConfig,
  AuthType,
} from '../../src/vtx_cli/packages/core/src/core/contentGenerator.js';

describe('Content Generator Configuration', () => {
  describe('createContentGeneratorConfig', () => {
    it('should create config for USE_VERTEX_AI auth type with project and location', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      // Set environment variables for the test
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

      // Cleanup
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_LOCATION'];
    });

    it('should default location to us-central1 if not specified', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project-456';

      const config = await createContentGeneratorConfig(
        mockConfig,
        AuthType.USE_VERTEX_AI,
      );

      expect(config.location).toBe('us-central1');

      // Cleanup
      delete process.env['GOOGLE_CLOUD_PROJECT'];
    });

    it('should create config for USE_GEMINI auth type', async () => {
      const mockConfig = {
        getProxy: () => undefined,
      } as any;

      process.env['GEMINI_API_KEY'] = 'test-api-key';

      const config = await createContentGeneratorConfig(
        mockConfig,
        AuthType.USE_GEMINI,
      );

      expect(config).toBeDefined();
      expect(config.authType).toBe(AuthType.USE_GEMINI);
      expect(config.vertexai).toBe(false);
      expect(config.apiKey).toBe('test-api-key');

      // Cleanup
      delete process.env['GEMINI_API_KEY'];
    });
  });
});
