# Quickstart: Fix Model Authentication Methods

**Feature**: Fix Model Authentication Methods  
**Branch**: `003-fix-model-auth`  
**Date**: January 2025

## Overview

This guide provides step-by-step instructions for implementing model-specific authentication methods in the CLI.

## Prerequisites

- Node.js >= 20.0.0
- TypeScript knowledge
- Python 3.8+ (for SDK-based models)
- Google Cloud credentials configured
- Access to Vertex AI models

## Step 1: Update Model Configuration

### 1.1 Update `models.yaml`

Edit `src/vtx_cli/configs/models.yaml` to specify authentication methods:

```yaml
# Bearer token models (OpenAPI endpoints)
deepseek-v3:
  name: "DeepSeek V3.1"
  endpoint_id: "deepseek-ai/deepseek-v3.1-maas"
  adapter: "gemini"
  region: "us-south1"
  endpoint: "us-south1-aiplatform.googleapis.com"
  api_type: "openapi"
  auth_method: "bearer_token"  # Already exists

qwen-coder:
  name: "Qwen 3 Coder 480B"
  endpoint_id: "qwen/qwen3-coder-480b-a35b-instruct-maas"
  adapter: "gemini"
  region: "us-south1"
  endpoint: "us-south1-aiplatform.googleapis.com"
  api_type: "openapi"
  auth_method: "bearer_token"  # Already exists

kimi-k2:
  name: "Kimi K2 Thinking"
  endpoint_id: "moonshotai/kimi-k2-thinking-maas"
  adapter: "gemini"
  region: "global"
  endpoint: "aiplatform.googleapis.com"
  api_type: "openapi"
  auth_method: "bearer_token"  # Already exists

# SDK-based models
claude-sonnet:
  name: "Claude Sonnet 4.5"
  endpoint_id: "claude-sonnet-4-5@20250929"
  adapter: "claude"
  region: "global"
  api_type: "vertex"
  auth_method: "claude_sdk"  # NEW

gemini:
  name: "Gemini 2.5 Pro"
  endpoint_id: "gemini-2.5-pro"
  adapter: "gemini"
  region: "global"
  api_type: "vertex"
  auth_method: "gemini_sdk"  # NEW
```

## Step 2: Create Authentication Types

### 2.1 Create `AuthMethodType.ts`

Create `src/vtx_cli/packages/core/src/auth/AuthMethodType.ts`:

```typescript
export enum AuthMethodType {
  BEARER_TOKEN = 'bearer_token',
  CLAUDE_SDK = 'claude_sdk',
  GEMINI_SDK = 'gemini_sdk',
}

export function parseAuthMethod(value: string): AuthMethodType {
  switch (value) {
    case 'bearer_token':
      return AuthMethodType.BEARER_TOKEN;
    case 'claude_sdk':
      return AuthMethodType.CLAUDE_SDK;
    case 'gemini_sdk':
      return AuthMethodType.GEMINI_SDK;
    default:
      throw new Error(`Unknown auth method: ${value}`);
  }
}
```

## Step 3: Implement OpenAPI Adapter

### 3.1 Create `OpenAPIAdapter.ts`

Create `src/vtx_cli/packages/cli/src/adapters/openapi-adapter.ts`:

```typescript
import { GoogleAuth } from 'google-auth-library';
import { ModelAuthAdapter, ModelAuthConfig, AuthResult, ModelRequest, ModelResponse } from '../types';

export class OpenAPIAdapter implements ModelAuthAdapter {
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  constructor(private googleAuth: GoogleAuth) {}

  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    try {
      const token = await this.getToken(config);
      return {
        success: true,
        token,
        expiresAt: this.tokenCache.get(config.modelAlias)?.expiresAt || Date.now() + 3600000,
        method: AuthMethodType.BEARER_TOKEN,
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapError(error),
        method: AuthMethodType.BEARER_TOKEN,
      };
    }
  }

  private async getToken(config: ModelAuthConfig): Promise<string> {
    const cached = this.tokenCache.get(config.modelAlias);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.token;
    }

    const client = await this.googleAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    
    if (!tokenResponse.token) {
      throw new Error('Failed to obtain access token');
    }

    // Cache token (assume 1 hour expiry, adjust based on actual token)
    this.tokenCache.set(config.modelAlias, {
      token: tokenResponse.token,
      expiresAt: Date.now() + 3600000,
    });

    return tokenResponse.token;
  }

  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    const config = request.config;
    const token = await this.getToken(config);
    const endpoint = this.buildEndpoint(config);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.modelId,
        stream: request.stream || false,
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return await response.json();
  }

  private buildEndpoint(config: ModelAuthConfig): string {
    const baseUrl = config.endpoint || `${config.region}-aiplatform.googleapis.com`;
    return `https://${baseUrl}/v1/projects/${config.projectId}/locations/${config.region}/endpoints/openapi/chat/completions`;
  }

  supportsStreaming(): boolean {
    return true;
  }

  getAuthMethod(): AuthMethodType {
    return AuthMethodType.BEARER_TOKEN;
  }

  async validateDependencies(): Promise<boolean> {
    // GoogleAuth is always available (it's a dependency)
    return true;
  }

  private mapError(error: any): AuthError {
    // Map errors to AuthError codes
    // Implementation details...
  }
}
```

## Step 4: Implement SDK Adapters

### 4.1 Create `ClaudeSDKAdapter.ts`

Create `src/vtx_cli/packages/cli/src/adapters/claude-sdk-adapter.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { ModelAuthAdapter, ModelAuthConfig, AuthResult, ModelRequest, ModelResponse } from '../types';

const execAsync = promisify(exec);

export class ClaudeSDKAdapter implements ModelAuthAdapter {
  constructor(
    private pythonPath: string = 'python3',
    private projectId: string,
    private region: string = 'global'
  ) {}

  async authenticate(config: ModelAuthConfig): Promise<AuthResult> {
    const depsValid = await this.validateDependencies();
    if (!depsValid) {
      return {
        success: false,
        error: {
          code: 'MISSING_DEPENDENCY',
          message: 'Claude SDK not found',
          actionableSteps: ['Install with: pip install anthropic[vertex]'],
          missingDependency: 'anthropic[vertex]',
        },
        method: AuthMethodType.CLAUDE_SDK,
      };
    }

    // SDK handles authentication automatically
    return {
      success: true,
      method: AuthMethodType.CLAUDE_SDK,
    };
  }

  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    const script = this.generatePythonScript(request);
    const { stdout, stderr } = await execAsync(
      `${this.pythonPath} -c "${script}" ${this.projectId} ${this.region} ${request.config.modelId}`,
      { input: JSON.stringify(request) }
    );

    if (stderr) {
      throw new Error(`Python script error: ${stderr}`);
    }

    return JSON.parse(stdout);
  }

  private generatePythonScript(request: ModelRequest): string {
    return `
import json
import sys
from anthropic import AnthropicVertex

project_id = sys.argv[1]
region = sys.argv[2]
model_id = sys.argv[3]
request_json = sys.stdin.read()
request = json.loads(request_json)

client = AnthropicVertex(region=region, project_id=project_id)
response = client.messages.create(
    max_tokens=request.get('max_tokens', 1024),
    messages=request['messages'],
    model=model_id
)

result = {
    'content': response.content[0].text,
    'stop_reason': response.stop_reason
}
print(json.dumps(result))
    `.trim();
  }

  supportsStreaming(): boolean {
    return true;
  }

  getAuthMethod(): AuthMethodType {
    return AuthMethodType.CLAUDE_SDK;
  }

  async validateDependencies(): Promise<boolean> {
    try {
      await execAsync(`${this.pythonPath} -c "import anthropic"`);
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4.2 Create `GeminiSDKAdapter.ts`

Similar structure to `ClaudeSDKAdapter`, but using `google.genai`:

```typescript
// Similar to ClaudeSDKAdapter, but:
// - Use 'from google import genai'
// - Use genai.Client(vertexai=True, project=..., location=...)
// - Use client.models.generate_content()
```

## Step 5: Update ModelService

### 5.1 Extend `ModelService.ts`

Update `src/vtx_cli/packages/core/src/services/modelService.ts`:

```typescript
import { OpenAPIAdapter } from '../../cli/src/adapters/openapi-adapter';
import { ClaudeSDKAdapter } from '../../cli/src/adapters/claude-sdk-adapter';
import { GeminiSDKAdapter } from '../../cli/src/adapters/gemini-sdk-adapter';
import { GoogleAuth } from 'google-auth-library';

export class ModelService {
  private adapters: Map<string, ModelAuthAdapter> = new Map();

  getAdapter(config: ModelAuthConfig): ModelAuthAdapter {
    const key = `${config.modelAlias}-${config.authMethod}`;
    
    if (this.adapters.has(key)) {
      return this.adapters.get(key)!;
    }

    let adapter: ModelAuthAdapter;
    
    switch (config.authMethod) {
      case AuthMethodType.BEARER_TOKEN:
        adapter = new OpenAPIAdapter(new GoogleAuth());
        break;
      case AuthMethodType.CLAUDE_SDK:
        adapter = new ClaudeSDKAdapter('python3', config.projectId, config.region);
        break;
      case AuthMethodType.GEMINI_SDK:
        adapter = new GeminiSDKAdapter('python3', config.projectId, config.region);
        break;
      default:
        throw new Error(`Unknown auth method: ${config.authMethod}`);
    }

    this.adapters.set(key, adapter);
    return adapter;
  }
}
```

## Step 6: Integration

### 6.1 Update Content Generator

Update `src/vtx_cli/packages/core/src/core/vertexAiContentGenerator.ts` to use adapters:

```typescript
const modelService = new ModelService();
const config = await modelService.getModelConfig(modelAlias);
const adapter = modelService.getAdapter(config);

const authResult = await adapter.authenticate(config);
if (!authResult.success) {
  throw new AuthError(authResult.error!);
}

const response = await adapter.sendRequest({
  config,
  messages,
  stream: false,
});
```

## Step 7: Testing

### 7.1 Unit Tests

Create test files:
- `tests/unit/model-auth/openapi-adapter.test.ts`
- `tests/unit/model-auth/claude-sdk-adapter.test.ts`
- `tests/unit/model-auth/gemini-sdk-adapter.test.ts`

### 7.2 Integration Tests

Create test files:
- `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts`
- `src/vtx_cli/integration-tests/model-auth/claude-sdk-auth.test.ts`
- `src/vtx_cli/integration-tests/model-auth/gemini-sdk-auth.test.ts`

## Step 8: Error Handling

### 8.1 User-Friendly Error Messages

Ensure all errors provide actionable steps:
- Missing dependencies → Installation instructions
- Invalid credentials → Credential refresh steps
- Missing env vars → List required variables

## Next Steps

1. Implement adapters following the contracts
2. Add comprehensive error handling
3. Write unit and integration tests
4. Update documentation
5. Test with real models in development environment

