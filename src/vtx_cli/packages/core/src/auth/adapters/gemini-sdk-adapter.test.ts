/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { spawn } from 'node:child_process';
import { GeminiSDKAdapter } from './gemini-sdk-adapter.js';
import { AuthMethodType } from '../AuthMethodType.js';
import { AuthError } from '../AuthError.js';
import type { ModelAuthConfig } from '../../services/modelService.js';

// Mock child_process
vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  return {
    spawn: mockSpawn,
  };
});

describe('GeminiSDKAdapter', () => {
  let adapter: GeminiSDKAdapter;
  let mockSpawn: Mock;
  let mockProcess: {
    stdin: { write: Mock; end: Mock };
    stdout: { on: Mock };
    stderr: { on: Mock };
    on: Mock;
  };

  const mockConfig: ModelAuthConfig = {
    modelAlias: 'gemini',
    name: 'Gemini 2.5 Pro',
    endpoint_id: 'gemini-2.5-pro',
    adapter: 'gemini',
    region: 'global',
    api_type: 'vertex',
    auth_method: 'gemini_sdk',
    authMethod: AuthMethodType.GEMINI_SDK,
    projectId: 'test-project',
    modelId: 'gemini-2.5-pro',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockProcess = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Simulate stdout data
            setTimeout(() => callback(Buffer.from('{"content":"test response","stop_reason":"STOP"}')), 10);
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful close
          setTimeout(() => callback(0), 20);
        }
        if (event === 'error') {
          // Don't call error by default
        }
      }),
    };

    mockSpawn = spawn as Mock;
    mockSpawn.mockReturnValue(mockProcess);

    adapter = new GeminiSDKAdapter('python3');
  });

  describe('getAuthMethod', () => {
    it('should return GEMINI_SDK', () => {
      expect(adapter.getAuthMethod()).toBe(AuthMethodType.GEMINI_SDK);
    });
  });

  describe('supportsStreaming', () => {
    it('should return true', () => {
      expect(adapter.supportsStreaming()).toBe(true);
    });
  });

  describe('validateDependencies', () => {
    it('should return true when Python and google.genai are available', async () => {
      // Mock successful Python check
      mockSpawn.mockImplementation((cmd, args) => {
        if (args && args[0] === '--version') {
          const proc = {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
            }),
          };
          return proc;
        }
        if (args && args[0] === '-c' && args[1]?.includes('from google import genai')) {
          const proc = {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
            }),
            stderr: {
              on: vi.fn(),
            },
          };
          return proc;
        }
        return mockProcess;
      });

      const result = await adapter.validateDependencies();
      expect(result).toBe(true);
    });

    it('should return false when Python is not available', async () => {
      mockSpawn.mockImplementation((cmd, args) => {
        const proc = {
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('Command not found')), 10);
            }
            if (event === 'close') {
              setTimeout(() => callback(1), 10);
            }
          }),
        };
        return proc;
      });

      const result = await adapter.validateDependencies();
      expect(result).toBe(false);
    });

    it('should return false when google.genai package is not installed', async () => {
      mockSpawn.mockImplementation((cmd, args) => {
        if (args && args[0] === '--version') {
          const proc = {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
            }),
          };
          return proc;
        }
        if (args && args[0] === '-c') {
          const proc = {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(1), 10); // Import failed
              }
            }),
            stderr: {
              on: vi.fn(),
            },
          };
          return proc;
        }
        return mockProcess;
      });

      const result = await adapter.validateDependencies();
      expect(result).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('should return success when dependencies are valid', async () => {
      // Mock successful dependency check
      mockSpawn.mockImplementation((cmd, args) => {
        const proc = {
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
          stderr: {
            on: vi.fn(),
          },
        };
        return proc;
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(true);
      expect(result.method).toBe(AuthMethodType.GEMINI_SDK);
    });

    it('should return error when dependencies are missing', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = {
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('Command not found')), 10);
            }
            if (event === 'close') {
              setTimeout(() => callback(1), 10);
            }
          }),
        };
        return proc;
      });

      const result = await adapter.authenticate(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
    });

    it('should return error when projectId is missing', async () => {
      const configWithoutProject = {
        ...mockConfig,
        projectId: '',
      };

      const result = await adapter.authenticate(configWithoutProject);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
    });
  });

  describe('sendRequest', () => {
    beforeEach(() => {
      // Mock successful dependency check
      mockSpawn.mockImplementation((cmd, args) => {
        if (args && (args[0] === '--version' || (args[0] === '-c' && args[1]?.includes('from google')))) {
          const proc = {
            on: vi.fn((event, callback) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
            }),
            stderr: {
              on: vi.fn(),
            },
          };
          return proc;
        }
        // Return mock process for actual request
        return mockProcess;
      });
    });

    it('should send request and return response', async () => {
      const request = {
        config: mockConfig,
        messages: [
          { role: 'user' as const, content: 'Hello' },
        ],
      };

      const response = await adapter.sendRequest(request);

      expect(response.content).toBe('test response');
      expect(response.stopReason).toBe('STOP');
      expect(mockSpawn).toHaveBeenCalled();
      expect(mockProcess.stdin.write).toHaveBeenCalled();
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it('should handle Python script errors', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10); // Non-zero exit code
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => {
            callback(Buffer.from('{"error":"Import error","error_type":"ImportError"}'));
          }, 10);
        }
      });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Network timeout')), 10);
        }
      });

      const request = {
        config: mockConfig,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(adapter.sendRequest(request)).rejects.toThrow(AuthError);
    });
  });
});

