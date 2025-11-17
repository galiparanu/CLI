/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OpenAPIAdapter } from './openapi-adapter.js';
import { ClaudeSDKAdapter } from './claude-sdk-adapter.js';
import { GeminiSDKAdapter } from './gemini-sdk-adapter.js';
import { AuthMethodType } from '../AuthMethodType.js';
import { AuthError, AuthErrorCode } from '../AuthError.js';
import type { ModelAuthConfig } from '../../services/modelService.js';
import { spawn } from 'node:child_process';

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

// Mock child_process
vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  return {
    spawn: mockSpawn,
  };
});

// Mock global fetch
global.fetch = vi.fn() as Mock;

describe('Error Scenarios - Unit Tests', () => {
  const mockConfig: ModelAuthConfig = {
    modelAlias: 'test-model',
    name: 'Test Model',
    endpoint_id: 'test/endpoint-id',
    adapter: 'gemini',
    region: 'us-central1',
    endpoint: 'us-central1-aiplatform.googleapis.com',
    api_type: 'openapi',
    auth_method: 'bearer_token',
    authMethod: AuthMethodType.BEARER_TOKEN,
    projectId: 'test-project',
    modelId: 'test/endpoint-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OpenAPIAdapter - Missing Credentials', () => {
    it('should handle missing credentials error', async () => {
      const adapter = new OpenAPIAdapter();
      
      mockGetClient.mockResolvedValue({
        getAccessToken: mockGetAccessToken,
        credentials: { expiry_date: null },
      });
      mockGetAccessToken.mockResolvedValue({ token: undefined });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      expect(result.error?.actionableSteps).toBeDefined();
      expect(result.error?.actionableSteps?.length).toBeGreaterThan(0);
    });

    it('should handle invalid credentials error', async () => {
      const adapter = new OpenAPIAdapter();
      
      mockGetClient.mockRejectedValue(
        new Error('Could not load the default credentials'),
      );

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_CREDENTIALS);
      expect(result.error?.actionableSteps).toBeDefined();
    });

    it('should handle API error with status code', async () => {
      const adapter = new OpenAPIAdapter();
      
      mockGetClient.mockResolvedValue({
        getAccessToken: mockGetAccessToken,
        credentials: { expiry_date: Date.now() + 3600000 },
      });
      mockGetAccessToken.mockResolvedValue({ token: 'test-token' });

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid token'),
      });

      await expect(
        adapter.sendRequest({
          config: mockConfig,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(AuthError);

      await expect(
        adapter.sendRequest({
          config: mockConfig,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toHaveProperty('code', AuthErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('ClaudeSDKAdapter - Missing Dependencies', () => {
    it('should handle missing Python error', async () => {
      const adapter = new ClaudeSDKAdapter('nonexistent-python');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'nonexistent-python' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'error') {
                callback(new Error('Command not found'));
              }
              if (event === 'close') {
                callback(1);
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_DEPENDENCY);
      expect(result.error?.missingDependency).toBeDefined();
      expect(result.error?.actionableSteps).toBeDefined();
      expect(result.error?.actionableSteps?.length).toBeGreaterThan(0);
    });

    it('should handle missing anthropic package error', async () => {
      const adapter = new ClaudeSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'import anthropic; from anthropic import AnthropicVertex') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(1); // Import failed
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_DEPENDENCY);
      expect(result.error?.actionableSteps).toBeDefined();
      expect(result.error?.actionableSteps?.some((step) => step.includes('pip install'))).toBe(true);
    });

    it('should handle missing GOOGLE_CLOUD_PROJECT environment variable', async () => {
      const adapter = new ClaudeSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'import anthropic; from anthropic import AnthropicVertex') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const configWithoutProject: ModelAuthConfig = {
        ...mockConfig,
        projectId: '',
        authMethod: AuthMethodType.CLAUDE_SDK,
      };

      const result = await adapter.authenticate(configWithoutProject);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_ENV_VAR);
      expect(result.error?.actionableSteps).toBeDefined();
    });
  });

  describe('GeminiSDKAdapter - Missing Dependencies', () => {
    it('should handle missing Python error', async () => {
      const adapter = new GeminiSDKAdapter('nonexistent-python');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'nonexistent-python' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'error') {
                callback(new Error('Command not found'));
              }
              if (event === 'close') {
                callback(1);
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_DEPENDENCY);
      expect(result.error?.missingDependency).toBeDefined();
      expect(result.error?.actionableSteps).toBeDefined();
    });

    it('should handle missing google-genai package error', async () => {
      const adapter = new GeminiSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'from google import genai') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(1); // Import failed
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_DEPENDENCY);
      expect(result.error?.actionableSteps).toBeDefined();
      expect(result.error?.actionableSteps?.some((step) => step.includes('pip install'))).toBe(true);
    });

    it('should handle missing GOOGLE_CLOUD_PROJECT environment variable', async () => {
      const adapter = new GeminiSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'from google import genai') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        return { on: vi.fn() };
      });

      const configWithoutProject: ModelAuthConfig = {
        ...mockConfig,
        projectId: '',
        authMethod: AuthMethodType.GEMINI_SDK,
      };

      const result = await adapter.authenticate(configWithoutProject);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AuthErrorCode.MISSING_ENV_VAR);
      expect(result.error?.actionableSteps).toBeDefined();
    });
  });

  describe('Python Execution Errors', () => {
    it('should handle Python script execution errors in ClaudeSDKAdapter', async () => {
      const adapter = new ClaudeSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      // Mock successful dependency validation
      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'import anthropic; from anthropic import AnthropicVertex') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        // Mock sendRequest Python script execution
        if (command === 'python3' && args[0] === '-c') {
          const mockProcess = {
            stdin: { write: vi.fn(), end: vi.fn() },
            stdout: { on: vi.fn() },
            stderr: {
              on: vi.fn((event, callback) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('Python error')), 10);
                }
              }),
            },
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(1), 20);
              }
            }),
          };
          return mockProcess;
        }
        return { on: vi.fn() };
      });

      const config: ModelAuthConfig = {
        ...mockConfig,
        authMethod: AuthMethodType.CLAUDE_SDK,
      };

      await expect(
        adapter.sendRequest({
          config,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(AuthError);

      await expect(
        adapter.sendRequest({
          config,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toHaveProperty('code', AuthErrorCode.MISSING_DEPENDENCY);
    });

    it('should handle Python script execution errors in GeminiSDKAdapter', async () => {
      const adapter = new GeminiSDKAdapter('python3');
      const mockSpawn = spawn as Mock;

      // Mock successful dependency validation
      mockSpawn.mockImplementation((command, args) => {
        if (command === 'python3' && args[0] === '--version') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        if (command === 'python3' && args[1] === 'from google import genai') {
          return {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                callback(0);
              }
            }),
          };
        }
        // Mock sendRequest Python script execution
        if (command === 'python3' && args[0] === '-c') {
          const mockProcess = {
            stdin: { write: vi.fn(), end: vi.fn() },
            stdout: { on: vi.fn() },
            stderr: {
              on: vi.fn((event, callback) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('Python error')), 10);
                }
              }),
            },
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(1), 20);
              }
            }),
          };
          return mockProcess;
        }
        return { on: vi.fn() };
      });

      const config: ModelAuthConfig = {
        ...mockConfig,
        authMethod: AuthMethodType.GEMINI_SDK,
      };

      await expect(
        adapter.sendRequest({
          config,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(AuthError);

      await expect(
        adapter.sendRequest({
          config,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toHaveProperty('code', AuthErrorCode.MISSING_DEPENDENCY);
    });
  });
});

