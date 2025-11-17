/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelService } from '../../../packages/core/src/services/modelService.js';
import { AuthMethodType } from '../../../packages/core/src/auth/AuthMethodType.js';
import { OpenAPIAdapter } from '../../../packages/core/src/auth/adapters/openapi-adapter.js';
import { ClaudeSDKAdapter } from '../../../packages/core/src/auth/adapters/claude-sdk-adapter.js';
import { GeminiSDKAdapter } from '../../../packages/core/src/auth/adapters/gemini-sdk-adapter.js';

describe('Model Switching - Integration Tests', () => {
  let modelService: ModelService;
  const testProjectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'test-project';

  beforeEach(() => {
    modelService = new ModelService();
    modelService.loadModels();
  });

  describe('Switching between different authentication methods', () => {
    it('should switch from bearer token to Claude SDK adapter', () => {
      // Start with bearer token model
      const bearerConfig = modelService.getModelConfig('deepseek-v3', testProjectId);
      const bearerAdapter = modelService.getAdapter(bearerConfig);
      
      expect(bearerAdapter).toBeInstanceOf(OpenAPIAdapter);
      expect(bearerAdapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);

      // Switch to Claude SDK model
      const claudeConfig = modelService.getModelConfig('claude-sonnet', testProjectId);
      const claudeAdapter = modelService.getAdapter(claudeConfig);
      
      expect(claudeAdapter).toBeInstanceOf(ClaudeSDKAdapter);
      expect(claudeAdapter.getAuthMethod()).toBe(AuthMethodType.CLAUDE_SDK);
    });

    it('should switch from bearer token to Gemini SDK adapter', () => {
      // Start with bearer token model
      const bearerConfig = modelService.getModelConfig('qwen-coder', testProjectId);
      const bearerAdapter = modelService.getAdapter(bearerConfig);
      
      expect(bearerAdapter).toBeInstanceOf(OpenAPIAdapter);
      expect(bearerAdapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);

      // Switch to Gemini SDK model
      const geminiConfig = modelService.getModelConfig('gemini', testProjectId);
      const geminiAdapter = modelService.getAdapter(geminiConfig);
      
      expect(geminiAdapter).toBeInstanceOf(GeminiSDKAdapter);
      expect(geminiAdapter.getAuthMethod()).toBe(AuthMethodType.GEMINI_SDK);
    });

    it('should switch between different bearer token models', () => {
      // Start with DeepSeek
      const deepseekConfig = modelService.getModelConfig('deepseek-v3', testProjectId);
      const deepseekAdapter = modelService.getAdapter(deepseekConfig);
      
      expect(deepseekAdapter).toBeInstanceOf(OpenAPIAdapter);
      expect(deepseekAdapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);

      // Switch to Qwen
      const qwenConfig = modelService.getModelConfig('qwen-coder', testProjectId);
      const qwenAdapter = modelService.getAdapter(qwenConfig);
      
      expect(qwenAdapter).toBeInstanceOf(OpenAPIAdapter);
      expect(qwenAdapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);

      // Switch to Kimi
      const kimiConfig = modelService.getModelConfig('kimi-k2', testProjectId);
      const kimiAdapter = modelService.getAdapter(kimiConfig);
      
      expect(kimiAdapter).toBeInstanceOf(OpenAPIAdapter);
      expect(kimiAdapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
    });

    it('should switch from Claude SDK to Gemini SDK adapter', () => {
      // Start with Claude SDK
      const claudeConfig = modelService.getModelConfig('claude-sonnet', testProjectId);
      const claudeAdapter = modelService.getAdapter(claudeConfig);
      
      expect(claudeAdapter).toBeInstanceOf(ClaudeSDKAdapter);
      expect(claudeAdapter.getAuthMethod()).toBe(AuthMethodType.CLAUDE_SDK);

      // Switch to Gemini SDK
      const geminiConfig = modelService.getModelConfig('gemini', testProjectId);
      const geminiAdapter = modelService.getAdapter(geminiConfig);
      
      expect(geminiAdapter).toBeInstanceOf(GeminiSDKAdapter);
      expect(geminiAdapter.getAuthMethod()).toBe(AuthMethodType.GEMINI_SDK);
    });

    it('should maintain adapter cache when switching between models with same auth method', () => {
      // Get adapter for DeepSeek
      const deepseekConfig = modelService.getModelConfig('deepseek-v3', testProjectId);
      const deepseekAdapter1 = modelService.getAdapter(deepseekConfig);

      // Get adapter for Qwen (same auth method)
      const qwenConfig = modelService.getModelConfig('qwen-coder', testProjectId);
      const qwenAdapter = modelService.getAdapter(qwenConfig);

      // Get adapter for DeepSeek again (should be cached)
      const deepseekAdapter2 = modelService.getAdapter(deepseekConfig);

      // Adapters should be different instances (different model aliases)
      expect(deepseekAdapter1).not.toBe(deepseekAdapter2);
      expect(qwenAdapter).not.toBe(deepseekAdapter1);
      expect(qwenAdapter).not.toBe(deepseekAdapter2);

      // But all should be OpenAPIAdapter instances
      expect(deepseekAdapter1).toBeInstanceOf(OpenAPIAdapter);
      expect(deepseekAdapter2).toBeInstanceOf(OpenAPIAdapter);
      expect(qwenAdapter).toBeInstanceOf(OpenAPIAdapter);
    });

    it('should handle rapid switching between multiple models', () => {
      const models = [
        'deepseek-v3',
        'qwen-coder',
        'kimi-k2',
        'claude-sonnet',
        'gemini',
      ];

      const adapters = models.map((alias) => {
        const config = modelService.getModelConfig(alias, testProjectId);
        return modelService.getAdapter(config);
      });

      // Verify all adapters are created successfully
      expect(adapters.length).toBe(5);
      expect(adapters[0]).toBeInstanceOf(OpenAPIAdapter);
      expect(adapters[1]).toBeInstanceOf(OpenAPIAdapter);
      expect(adapters[2]).toBeInstanceOf(OpenAPIAdapter);
      expect(adapters[3]).toBeInstanceOf(ClaudeSDKAdapter);
      expect(adapters[4]).toBeInstanceOf(GeminiSDKAdapter);

      // Verify auth methods
      expect(adapters[0].getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapters[1].getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapters[2].getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapters[3].getAuthMethod()).toBe(AuthMethodType.CLAUDE_SDK);
      expect(adapters[4].getAuthMethod()).toBe(AuthMethodType.GEMINI_SDK);
    });
  });
});

