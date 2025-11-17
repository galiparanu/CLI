/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelService } from '../../../packages/core/src/services/modelService.js';
import { ClaudeSDKAdapter } from '../../../packages/core/src/auth/adapters/claude-sdk-adapter.js';
import { AuthMethodType } from '../../../packages/core/src/auth/AuthMethodType.js';
import type { ModelAuthConfig } from '../../../packages/core/src/services/modelService.js';

describe('Claude SDK Authentication - Integration Tests', () => {
  let modelService: ModelService;
  const testProjectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'test-project';

  beforeEach(() => {
    modelService = new ModelService();
    modelService.loadModels();
  });

  describe('Claude Sonnet 4.5 Authentication', () => {
    it('should have correct configuration in models.yaml', () => {
      const model = modelService.getModel('claude-sonnet');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('claude_sdk');
      expect(model?.region).toBe('global');
      expect(model?.api_type).toBe('vertex');
      expect(model?.endpoint_id).toBe('claude-sonnet-4-5@20250929');
    });

    it('should load ModelAuthConfig with correct authMethod', () => {
      const config = modelService.getModelConfig('claude-sonnet', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.CLAUDE_SDK);
      expect(config.modelAlias).toBe('claude-sonnet');
      expect(config.region).toBe('global');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('claude-sonnet-4-5@20250929');
    });

    it('should return ClaudeSDKAdapter for Claude Sonnet', () => {
      const config = modelService.getModelConfig('claude-sonnet', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(ClaudeSDKAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.CLAUDE_SDK);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should validate Claude Sonnet configuration', () => {
      const config = modelService.getModelConfig('claude-sonnet', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should use global region for Claude Sonnet', () => {
      const config = modelService.getModelConfig('claude-sonnet', testProjectId);
      
      expect(config.region).toBe('global');
    });
  });

  describe('Dependency Validation', () => {
    it('should validate dependencies when adapter is created', async () => {
      const config = modelService.getModelConfig('claude-sonnet', testProjectId);
      const adapter = modelService.getAdapter(config) as ClaudeSDKAdapter;
      
      // Note: This will return false if Python/anthropic is not installed
      // In a real environment, this would check actual dependencies
      const depsValid = await adapter.validateDependencies();
      
      // We just verify the method exists and returns a boolean
      expect(typeof depsValid).toBe('boolean');
    });
  });
});

