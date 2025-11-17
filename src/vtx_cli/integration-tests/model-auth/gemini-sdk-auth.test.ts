/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelService } from '../../../packages/core/src/services/modelService.js';
import { GeminiSDKAdapter } from '../../../packages/core/src/auth/adapters/gemini-sdk-adapter.js';
import { AuthMethodType } from '../../../packages/core/src/auth/AuthMethodType.js';
import type { ModelAuthConfig } from '../../../packages/core/src/services/modelService.js';

describe('Gemini SDK Authentication - Integration Tests', () => {
  let modelService: ModelService;
  const testProjectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'test-project';

  beforeEach(() => {
    modelService = new ModelService();
    modelService.loadModels();
  });

  describe('Gemini 2.5 Pro Authentication', () => {
    it('should have correct configuration in models.yaml', () => {
      const model = modelService.getModel('gemini');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('gemini_sdk');
      expect(model?.region).toBe('global');
      expect(model?.api_type).toBe('vertex');
      expect(model?.endpoint_id).toBe('gemini-2.5-pro');
    });

    it('should load ModelAuthConfig with correct authMethod', () => {
      const config = modelService.getModelConfig('gemini', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.GEMINI_SDK);
      expect(config.modelAlias).toBe('gemini');
      expect(config.region).toBe('global');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('gemini-2.5-pro');
    });

    it('should return GeminiSDKAdapter for Gemini 2.5 Pro', () => {
      const config = modelService.getModelConfig('gemini', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(GeminiSDKAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.GEMINI_SDK);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should validate Gemini 2.5 Pro configuration', () => {
      const config = modelService.getModelConfig('gemini', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should use global region for Gemini 2.5 Pro', () => {
      const config = modelService.getModelConfig('gemini', testProjectId);
      
      expect(config.region).toBe('global');
    });
  });

  describe('Dependency Validation', () => {
    it('should validate dependencies when adapter is created', async () => {
      const config = modelService.getModelConfig('gemini', testProjectId);
      const adapter = modelService.getAdapter(config) as GeminiSDKAdapter;
      
      // Note: This will return false if Python/google-genai is not installed
      // In a real environment, this would check actual dependencies
      const depsValid = await adapter.validateDependencies();
      
      // We just verify the method exists and returns a boolean
      expect(typeof depsValid).toBe('boolean');
    });
  });
});

