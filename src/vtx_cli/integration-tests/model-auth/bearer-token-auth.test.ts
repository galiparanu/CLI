/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelService } from '../../../packages/core/src/services/modelService.js';
import { OpenAPIAdapter } from '../../../packages/core/src/auth/adapters/openapi-adapter.js';
import { AuthMethodType } from '../../../packages/core/src/auth/AuthMethodType.js';
import type { ModelAuthConfig } from '../../../packages/core/src/services/modelService.js';

describe('Bearer Token Authentication - Integration Tests', () => {
  let modelService: ModelService;
  const testProjectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'test-project';

  beforeEach(() => {
    modelService = new ModelService();
    modelService.loadModels();
  });

  describe('Qwen Coder Authentication', () => {
    it('should have correct configuration in models.yaml', () => {
      const model = modelService.getModel('qwen-coder');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('bearer_token');
      expect(model?.region).toBe('us-south1');
      expect(model?.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(model?.api_type).toBe('openapi');
      expect(model?.endpoint_id).toBe('qwen/qwen3-coder-480b-a35b-instruct-maas');
    });

    it('should load ModelAuthConfig with correct authMethod', () => {
      const config = modelService.getModelConfig('qwen-coder', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.BEARER_TOKEN);
      expect(config.modelAlias).toBe('qwen-coder');
      expect(config.region).toBe('us-south1');
      expect(config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('qwen/qwen3-coder-480b-a35b-instruct-maas');
    });

    it('should return OpenAPIAdapter for Qwen Coder', () => {
      const config = modelService.getModelConfig('qwen-coder', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(OpenAPIAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should validate Qwen Coder configuration', () => {
      const config = modelService.getModelConfig('qwen-coder', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  describe('DeepSeek Models Authentication', () => {
    it('should have correct configuration for DeepSeek v3.1', () => {
      const model = modelService.getModel('deepseek-v3');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('bearer_token');
      expect(model?.region).toBe('us-south1');
      expect(model?.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(model?.api_type).toBe('openapi');
      expect(model?.endpoint_id).toBe('deepseek-ai/deepseek-v3.1-maas');
    });

    it('should have correct configuration for DeepSeek R1 0528', () => {
      const model = modelService.getModel('deepseek-r1');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('bearer_token');
      expect(model?.region).toBe('us-south1');
      expect(model?.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(model?.api_type).toBe('openapi');
      expect(model?.endpoint_id).toBe('deepseek-ai/deepseek-r1-0528-maas');
    });

    it('should load ModelAuthConfig with correct authMethod for DeepSeek v3.1', () => {
      const config = modelService.getModelConfig('deepseek-v3', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.BEARER_TOKEN);
      expect(config.modelAlias).toBe('deepseek-v3');
      expect(config.region).toBe('us-south1');
      expect(config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('deepseek-ai/deepseek-v3.1-maas');
    });

    it('should load ModelAuthConfig with correct authMethod for DeepSeek R1 0528', () => {
      const config = modelService.getModelConfig('deepseek-r1', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.BEARER_TOKEN);
      expect(config.modelAlias).toBe('deepseek-r1');
      expect(config.region).toBe('us-south1');
      expect(config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('deepseek-ai/deepseek-r1-0528-maas');
    });

    it('should return OpenAPIAdapter for DeepSeek v3.1', () => {
      const config = modelService.getModelConfig('deepseek-v3', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(OpenAPIAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should return OpenAPIAdapter for DeepSeek R1 0528', () => {
      const config = modelService.getModelConfig('deepseek-r1', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(OpenAPIAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should validate DeepSeek v3.1 configuration', () => {
      const config = modelService.getModelConfig('deepseek-v3', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should validate DeepSeek R1 0528 configuration', () => {
      const config = modelService.getModelConfig('deepseek-r1', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should use us-south1 region endpoint for DeepSeek models', () => {
      const deepseekV3Config = modelService.getModelConfig('deepseek-v3', testProjectId);
      const deepseekR1Config = modelService.getModelConfig('deepseek-r1', testProjectId);
      
      expect(deepseekV3Config.region).toBe('us-south1');
      expect(deepseekV3Config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(deepseekR1Config.region).toBe('us-south1');
      expect(deepseekR1Config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
    });
  });

  describe('Kimi K2 Authentication', () => {
    it('should have correct configuration in models.yaml', () => {
      const model = modelService.getModel('kimi-k2');
      
      expect(model).toBeDefined();
      expect(model?.auth_method).toBe('bearer_token');
      expect(model?.region).toBe('global');
      expect(model?.endpoint).toBe('aiplatform.googleapis.com');
      expect(model?.api_type).toBe('openapi');
      expect(model?.endpoint_id).toBe('moonshotai/kimi-k2-thinking-maas');
    });

    it('should load ModelAuthConfig with correct authMethod', () => {
      const config = modelService.getModelConfig('kimi-k2', testProjectId);
      
      expect(config).toBeDefined();
      expect(config.authMethod).toBe(AuthMethodType.BEARER_TOKEN);
      expect(config.modelAlias).toBe('kimi-k2');
      expect(config.region).toBe('global');
      expect(config.endpoint).toBe('aiplatform.googleapis.com');
      expect(config.projectId).toBe(testProjectId);
      expect(config.modelId).toBe('moonshotai/kimi-k2-thinking-maas');
    });

    it('should return OpenAPIAdapter for Kimi K2', () => {
      const config = modelService.getModelConfig('kimi-k2', testProjectId);
      const adapter = modelService.getAdapter(config);
      
      expect(adapter).toBeInstanceOf(OpenAPIAdapter);
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
      expect(adapter.supportsStreaming()).toBe(true);
    });

    it('should validate Kimi K2 configuration', () => {
      const config = modelService.getModelConfig('kimi-k2', testProjectId);
      const validation = modelService.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  describe('Endpoint Construction', () => {
    it('should use us-south1 region endpoint for Qwen Coder', () => {
      const config = modelService.getModelConfig('qwen-coder', testProjectId);
      
      expect(config.region).toBe('us-south1');
      expect(config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      
      // Verify configuration is correct for us-south1 endpoint
      // The actual endpoint construction is tested in unit tests
      // Here we verify the config that will be used to construct the endpoint
      expect(config.region).toBe('us-south1');
      expect(config.endpoint).toContain('us-south1');
    });

    it('should have correct endpoint configuration for us-south1 region', () => {
      const config = modelService.getModelConfig('qwen-coder', testProjectId);
      
      // Verify endpoint format matches expected pattern for us-south1
      expect(config.endpoint).toBe('us-south1-aiplatform.googleapis.com');
      expect(config.region).toBe('us-south1');
      
      // Expected endpoint pattern: https://{region}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{region}/endpoints/openapi/chat/completions
      // For Qwen Coder: https://us-south1-aiplatform.googleapis.com/v1/projects/{projectId}/locations/us-south1/endpoints/openapi/chat/completions
      const expectedEndpointBase = 'us-south1-aiplatform.googleapis.com';
      expect(config.endpoint).toBe(expectedEndpointBase);
    });

    it('should use global region endpoint for Kimi K2', () => {
      const config = modelService.getModelConfig('kimi-k2', testProjectId);
      
      expect(config.region).toBe('global');
      expect(config.endpoint).toBe('aiplatform.googleapis.com');
      
      // Verify configuration is correct for global endpoint
      // The actual endpoint construction is tested in unit tests
      // Here we verify the config that will be used to construct the endpoint
      expect(config.region).toBe('global');
      expect(config.endpoint).toBe('aiplatform.googleapis.com');
    });

    it('should have correct endpoint configuration for global region', () => {
      const config = modelService.getModelConfig('kimi-k2', testProjectId);
      
      // Verify endpoint format matches expected pattern for global
      expect(config.endpoint).toBe('aiplatform.googleapis.com');
      expect(config.region).toBe('global');
      
      // Expected endpoint pattern: https://aiplatform.googleapis.com/v1/projects/{projectId}/locations/global/endpoints/openapi/chat/completions
      // For Kimi K2: https://aiplatform.googleapis.com/v1/projects/{projectId}/locations/global/endpoints/openapi/chat/completions
      const expectedEndpointBase = 'aiplatform.googleapis.com';
      expect(config.endpoint).toBe(expectedEndpointBase);
    });
  });
});

