/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { AuthMethodType } from '../AuthMethodType.js';
import type {
  ModelAuthAdapter,
  ModelRequest,
  ModelResponse,
} from '../ModelAuthAdapter.js';
import type { ModelAuthConfig } from '../../services/modelService.js';
import type { AuthResult } from '../AuthResult.js';
import { createSuccessAuthResult, createFailedAuthResult } from '../AuthResult.js';
import { AuthError, AuthErrorCode } from '../AuthError.js';

/**
 * Adapter for authenticating to Claude models via Anthropic Vertex SDK.
 * Uses Python SDK (anthropic[vertex]) executed via child process.
 */
export class ClaudeSDKAdapter implements ModelAuthAdapter {
  private pythonPath: string;

  constructor(pythonPath: string = 'python3') {
    this.pythonPath = pythonPath;
  }

  /**
   * Validates that required dependencies are available.
   */
  async validateDependencies(): Promise<boolean> {
    try {
      // Check if Python is available
      const pythonCheck = await this.checkPythonAvailable();
      if (!pythonCheck) {
        return false;
      }

      // Check if anthropic package is installed
      const anthropicCheck = await this.checkAnthropicPackage();
      return anthropicCheck;
    } catch {
      return false;
    }
  }

  /**
   * Checks if Python executable is available.
   */
  private async checkPythonAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.pythonPath, ['--version']);
      process.on('close', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Checks if anthropic package is installed.
   */
  private async checkAnthropicPackage(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.pythonPath, [
        '-c',
        'import anthropic; from anthropic import AnthropicVertex',
      ]);
      process.on('close', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
      // Suppress stderr for import errors
      process.stderr.on('data', () => {
        // Ignore stderr
      });
    });
  }

  /**
   * Authenticate using Claude SDK.
   * SDK handles credential discovery automatically.
   * Performance target: < 10 seconds for SDK dependency validation.
   */
  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    const startTime = Date.now();
    try {
      // Validate dependencies first
      const depsValid = await this.validateDependencies();
      const duration = Date.now() - startTime;
      
      if (duration > 10000) {
        console.warn(
          `[ClaudeSDKAdapter] Dependency validation took ${duration}ms (target: <10000ms) for ${config.modelAlias}`,
        );
      }
      
      if (!depsValid) {
        return createFailedAuthResult(
          AuthMethodType.CLAUDE_SDK,
          new AuthError(
            AuthErrorCode.MISSING_DEPENDENCY,
            'Python or the required Anthropic Vertex SDK package is not installed or accessible.',
            [
              `Ensure Python is installed and available at '${this.pythonPath}'`,
              `Install the Anthropic Vertex SDK: '${this.pythonPath} -m pip install anthropic[vertex]'`,
              `Verify Python installation: '${this.pythonPath} --version'`,
              `Verify Anthropic package: '${this.pythonPath} -c "import anthropic; print(anthropic.__version__)"'`,
            ],
            'Python or anthropic[vertex] package',
          ),
        );
      }

      // Validate project ID
      if (!config.projectId || config.projectId.trim().length === 0) {
        return createFailedAuthResult(
          AuthMethodType.CLAUDE_SDK,
          AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT'),
        );
      }

      // SDK handles authentication automatically, so we just return success
      return createSuccessAuthResult(AuthMethodType.CLAUDE_SDK);
    } catch (error) {
      const duration = Date.now() - startTime;
      if (duration > 10000) {
        console.warn(
          `[ClaudeSDKAdapter] Authentication failed after ${duration}ms (target: <10000ms) for ${config.modelAlias}`,
        );
      }
      return createFailedAuthResult(
        AuthMethodType.CLAUDE_SDK,
        error instanceof AuthError
          ? error
          : new AuthError(
              AuthErrorCode.MISSING_DEPENDENCY,
              `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
              [
                `Ensure Python is installed and available at '${this.pythonPath}'`,
                `Install the Anthropic Vertex SDK: '${this.pythonPath} -m pip install anthropic[vertex]'`,
              ],
              'Python or anthropic[vertex] package',
            ),
      );
    }
  }

  /**
   * Sends a request to Claude model via Python SDK.
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    const config = request.config;

    // Validate dependencies
    const depsValid = await this.validateDependencies();
    if (!depsValid) {
      throw new AuthError(
        AuthErrorCode.MISSING_DEPENDENCY,
        'Python or the required Anthropic Vertex SDK package is not installed or accessible.',
        [
          `Ensure Python is installed and available at '${this.pythonPath}'`,
          `Install the Anthropic Vertex SDK: '${this.pythonPath} -m pip install anthropic[vertex]'`,
          `Verify Python installation: '${this.pythonPath} --version'`,
          `Verify Anthropic package: '${this.pythonPath} -c "import anthropic; print(anthropic.__version__)"'`,
        ],
        'Python or anthropic[vertex] package',
      );
    }

    // Generate Python script
    const pythonScript = this.generatePythonScript(config);

    try {
      // Execute Python script
      const result = await this.executePythonScript(
        pythonScript,
        config.projectId,
        config.region || 'global',
        config.modelId,
        request,
      );

      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Generates Python script for Claude SDK.
   */
  private generatePythonScript(config: ModelAuthConfig): string {
    return `#!/usr/bin/env python3
import json
import sys
from anthropic import AnthropicVertex

def main():
    project_id = sys.argv[1]
    region = sys.argv[2]
    model_id = sys.argv[3]
    request_json = sys.stdin.read()
    
    try:
        request = json.loads(request_json)
        
        client = AnthropicVertex(
            region=region,
            project_id=project_id
        )
        
        # Prepare messages for Anthropic API
        messages = []
        for msg in request.get('messages', []):
            messages.append({
                'role': msg['role'],
                'content': msg['content']
            })
        
        # Call Claude API
        response = client.messages.create(
            model=model_id,
            max_tokens=request.get('max_tokens', request.get('maxTokens', 1024)),
            messages=messages
        )
        
        # Format response
        result = {
            'content': response.content[0].text if response.content else '',
            'stop_reason': response.stop_reason,
            'model': response.model,
            'usage': {
                'input_tokens': response.usage.input_tokens,
                'output_tokens': response.usage.output_tokens
            } if hasattr(response, 'usage') and response.usage else None
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'error_type': type(e).__name__
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
`;
  }

  /**
   * Executes Python script with request data.
   */
  private async executePythonScript(
    script: string,
    projectId: string,
    region: string,
    modelId: string,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    return new Promise((resolve, reject) => {
      // Prepare request data
      const requestData = {
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: request.maxTokens || 1024,
        stream: request.stream || false,
      };

      // Spawn Python process
      const pythonProcess = spawn(
        this.pythonPath,
        ['-c', script, projectId, region, modelId],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      // Write request data to stdin
      pythonProcess.stdin.write(JSON.stringify(requestData));
      pythonProcess.stdin.end();

      // Collect stdout
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          // Try to parse error from stderr
          try {
            const errorData = JSON.parse(stderr);
            reject(
              new Error(
                `Python script error: ${errorData.error || stderr || 'Unknown error'}`,
              ),
            );
          } catch {
            reject(
              new Error(
                `Python script failed with exit code ${code}: ${stderr || 'Unknown error'}`,
              ),
            );
          }
          return;
        }

        // Parse response
        try {
          const response = JSON.parse(stdout);
          
          // Check for error in response
          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          resolve({
            content: response.content || '',
            stopReason: response.stop_reason,
            ...response,
          });
        } catch (error) {
          reject(
            new Error(
              `Failed to parse Python script response: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });

      // Handle process errors
      pythonProcess.on('error', (error) => {
        reject(
          new Error(
            `Failed to execute Python script: ${error.message}`,
          ),
        );
      });
    });
  }

  /**
   * Supports streaming responses.
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Returns the authentication method type.
   */
  getAuthMethod(): AuthMethodType {
    return AuthMethodType.CLAUDE_SDK;
  }

  /**
   * Maps errors to AuthError.
   */
  private mapError(error: unknown): AuthError {
    if (error instanceof AuthError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (
        message.includes('no module named') ||
        message.includes('cannot find module') ||
        message.includes('import error')
      ) {
        return AuthError.missingDependency(
          'anthropic[vertex]',
          'pip install anthropic[vertex]',
        );
      }

      if (
        message.includes('credential') ||
        message.includes('authentication') ||
        message.includes('permission denied')
      ) {
        return AuthError.missingCredentials([
          'Run: gcloud auth application-default login',
          'Or set GOOGLE_APPLICATION_CREDENTIALS environment variable',
        ]);
      }

      if (
        message.includes('project') ||
        message.includes('project_id') ||
        message.includes('project id')
      ) {
        return AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT');
      }

      if (
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('timeout')
      ) {
        return AuthError.networkError(error.message, [
          'Check network connectivity',
          'Verify firewall settings',
        ]);
      }
    }

    return AuthError.invalidCredentials([
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

