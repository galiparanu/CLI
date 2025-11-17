/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OpenAPIAdapter } from './openapi-adapter.js';
import { AuthMethodType } from '../AuthMethodType.js';
import { AuthError, AuthErrorCode } from '../AuthError.js';
import type { ModelAuthConfig } from '../../services/modelService.js';

// Mock google-auth-library
const mockGetAccessToken = vi.fn();
const mockGetClient = vi.fn();

vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: vi.fn().mockImplementation(() => ({
      getClient: mockGetClient,
    })),
  };
});

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('OpenAPIAdapter', () => {
  let adapter: OpenAPIAdapter;
  let mockClient: {
    getAccessToken: Mock;
    credentials?: { expiry_date: number | null };
  };

  const mockConfig: ModelAuthConfig = {
    modelAlias: 'deepseek-v3',
    name: 'DeepSeek V3.1',
    endpoint_id: 'deepseek-ai/deepseek-v3.1-maas',
    adapter: 'gemini',
    region: 'us-south1',
    endpoint: 'us-south1-aiplatform.googleapis.com',
    api_type: 'openapi',
    auth_method: 'bearer_token',
    authMethod: AuthMethodType.BEARER_TOKEN,
    projectId: 'test-project',
    modelId: 'deepseek-ai/deepseek-v3.1-maas',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockClient = {
      getAccessToken: mockGetAccessToken,
      credentials: {
        expiry_date: Date.now() + 3600000, // 1 hour from now
      },
    };
    
    mockGetClient.mockResolvedValue(mockClient);
    mockGetAccessToken.mockResolvedValue({
      token: 'test-access-token',
    });

    adapter = new OpenAPIAdapter();
  });

  describe('getAuthMethod', () => {
    it('should return BEARER_TOKEN', () => {
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.BEARER_TOKEN);
    });
  });

  describe('supportsStreaming', () => {
    it('should return true', () => {
      expect(adapter.supportsStreaming()).toBe(true);
    });
  });

  describe('validateDependencies', () => {
    it('should return true (GoogleAuth is always available)', async () => {
      const result = await adapter.validateDependencies();
      expect(result).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('should successfully authenticate and return token', async () => {
      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(true);
      expect(result.method).toBe(AuthMethodType.BEARER_TOKEN);
      expect(result.token).toBe('test-access-token');
      expect(result.expiresAt).toBeDefined();
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('should cache token and reuse it on subsequent calls', async () => {
      // First call
      const result1 = await adapter.authenticate(mockConfig);
      expect(result1.success).toBe(true);
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await adapter.authenticate(mockConfig);
      expect(result2.success).toBe(true);
      // Should still be called once (cached)
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when it needs refresh (within 5 min buffer)', async () => {
      // Set expiry to 4 minutes from now (within refresh buffer)
      mockClient.credentials = {
        expiry_date: Date.now() + 4 * 60 * 1000,
      };

      // First call
      await adapter.authenticate(mockConfig);
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // Second call - should refresh
      await adapter.authenticate(mockConfig);
      expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should return error when token fetch fails', async () => {
      mockGetAccessToken.mockRejectedValueOnce(new Error('Failed to get token'));

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
      expect(result.error?.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    });

    it('should return error when no token is returned', async () => {
      mockGetAccessToken.mockResolvedValueOnce({ token: null });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
      expect(result.error?.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('sendRequest', () => {
    beforeEach(() => {
      // Mock successful authentication
      mockGetAccessToken.mockResolvedValue({
        token: 'test-access-token',
      });
    });

    it('should send request with correct headers and body', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Test response',
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = {
        config: mockConfig,
        messages: [
          { role: 'user' as const, content: 'Hello' },
        ],
        stream: false,
      };

      const response = await adapter.sendRequest(request);

      expect(response.content).toBe('Test response');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects/test-project/locations/us-south1/endpoints/openapi/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"model":"deepseek-ai/deepseek-v3.1-maas"'),
        }),
      );
    });

    it('should handle HTTP 401 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow(AuthError);
      await expect(adapter.sendRequest(request)).rejects.toThrow(/invalid credentials/i);
    });

    it('should handle HTTP 403 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow(AuthError);
    });

    it('should handle HTTP 404 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow(AuthError);
      await expect(adapter.sendRequest(request)).rejects.toThrow(/not found/i);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow(AuthError);
      await expect(adapter.sendRequest(request)).rejects.toThrow(/network error/i);
    });
  });

  describe('endpoint construction', () => {
    it('should construct endpoint URL correctly for us-south1', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'test' } }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      mockGetAccessToken.mockResolvedValue({ token: 'token' });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      await adapter.sendRequest(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://us-south1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-south1/endpoints/openapi/chat/completions',
        expect.any(Object),
      );
    });

    it('should handle global region correctly', async () => {
      const globalConfig: ModelAuthConfig = {
        ...mockConfig,
        region: 'global',
        endpoint: 'aiplatform.googleapis.com',
      };

      const mockResponse = {
        choices: [{ message: { content: 'test' } }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      mockGetAccessToken.mockResolvedValue({ token: 'token' });

      const request = {
        config: globalConfig,
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      await adapter.sendRequest(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/endpoints/openapi/chat/completions',
        expect.any(Object),
      );
    });
  });
});

