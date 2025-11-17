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
 * Adapter for authenticating to Gemini models via Google Gen AI Python SDK.
 * Uses Python SDK (google-genai) with vertexai=True executed via child process.
 */
export class GeminiSDKAdapter implements ModelAuthAdapter {
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

      // Check if google.genai package is installed
      const genaiCheck = await this.checkGenAIPackage();
      return genaiCheck;
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
   * Checks if google.genai package is installed.
   */
  private async checkGenAIPackage(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.pythonPath, [
        '-c',
        'from google import genai',
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
   * Authenticate using Gemini SDK.
   * SDK handles credential discovery automatically when vertexai=True.
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
          `[GeminiSDKAdapter] Dependency validation took ${duration}ms (target: <10000ms) for ${config.modelAlias}`,
        );
      }
      
      if (!depsValid) {
        return createFailedAuthResult(
          AuthMethodType.GEMINI_SDK,
          new AuthError(
            AuthErrorCode.MISSING_DEPENDENCY,
            'Python or the required Google Gen AI SDK package is not installed or accessible.',
            [
              `Ensure Python is installed and available at '${this.pythonPath}'`,
              `Install the Google Gen AI SDK: '${this.pythonPath} -m pip install google-generativeai vertexai'`,
              `Verify Python installation: '${this.pythonPath} --version'`,
              `Verify Google Gen AI package: '${this.pythonPath} -c "from google import genai; print(genai.__version__)"'`,
            ],
            'Python or google-genai package',
          ),
        );
      }

      // Validate project ID
      if (!config.projectId || config.projectId.trim().length === 0) {
        return createFailedAuthResult(
          AuthMethodType.GEMINI_SDK,
          AuthError.missingEnvVar('GOOGLE_CLOUD_PROJECT'),
        );
      }

      // SDK handles authentication automatically, so we just return success
      return createSuccessAuthResult(AuthMethodType.GEMINI_SDK);
    } catch (error) {
      const duration = Date.now() - startTime;
      if (duration > 10000) {
        console.warn(
          `[GeminiSDKAdapter] Authentication failed after ${duration}ms (target: <10000ms) for ${config.modelAlias}`,
        );
      }
      return createFailedAuthResult(
        AuthMethodType.GEMINI_SDK,
        error instanceof AuthError
          ? error
          : new AuthError(
              AuthErrorCode.MISSING_DEPENDENCY,
              `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
              [
                `Ensure Python is installed and available at '${this.pythonPath}'`,
                `Install the Google Gen AI SDK: '${this.pythonPath} -m pip install google-generativeai vertexai'`,
              ],
              'Python or google-genai package',
            ),
      );
    }
  }

  /**
   * Sends a request to Gemini model via Python SDK.
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    const config = request.config;

    // Validate dependencies
    const depsValid = await this.validateDependencies();
    if (!depsValid) {
      throw AuthError.missingDependency(
        'google-genai',
        'pip install google-genai',
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
   * Generates Python script for Gemini SDK.
   */
  private generatePythonScript(config: ModelAuthConfig): string {
    return `#!/usr/bin/env python3
import json
import sys
from google import genai

def main():
    project_id = sys.argv[1]
    location = sys.argv[2]
    model_id = sys.argv[3]
    request_json = sys.stdin.read()
    
    try:
        request = json.loads(request_json)
        
        # Initialize client with Vertex AI mode
        client = genai.Client(
            vertexai=True,
            project=project_id,
            location=location
        )
        
        # Prepare contents for Gemini API
        # Convert messages to contents format
        contents = []
        for msg in request.get('messages', []):
            if msg['role'] == 'user':
                contents.append(msg['content'])
            elif msg['role'] == 'assistant':
                contents.append(msg['content'])
            elif msg['role'] == 'system':
                # System messages can be passed as system_instruction if supported
                pass
        
        # Call Gemini API
        response = client.models.generate_content(
            model=model_id,
            contents=contents[0] if contents else '',
            config={
                'max_output_tokens': request.get('max_tokens', request.get('maxTokens', 1024)),
            } if request.get('max_tokens') or request.get('maxTokens') else {}
        )
        
        # Format response
        result = {
            'content': response.text if hasattr(response, 'text') else '',
            'stop_reason': getattr(response, 'stop_reason', None) or getattr(response, 'finish_reason', None),
            'model': getattr(response, 'model', model_id),
        }
        
        # Try to extract text from candidates if text attribute not available
        if not result['content'] and hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                parts_text = []
                for part in candidate.content.parts:
                    if hasattr(part, 'text'):
                        parts_text.append(part.text)
                result['content'] = ' '.join(parts_text)
        
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
    location: string,
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
        ['-c', script, projectId, location, modelId],
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
            stopReason: response.stop_reason || response.finish_reason,
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
    return AuthMethodType.GEMINI_SDK;
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
          'google-genai',
          'pip install google-genai',
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

