# Model Authentication Contracts

**Feature**: Fix Model Authentication Methods  
**Branch**: `003-fix-model-auth`  
**Date**: January 2025

## Overview

This document defines the API contracts, interfaces, and behavioral specifications for model-specific authentication methods.

## 1. ModelAuthAdapter Interface

### Contract Definition

```typescript
interface ModelAuthAdapter {
  /**
   * Authenticate using the configured method for this model
   * @param config Model authentication configuration
   * @returns Authentication result with token or error
   */
  authenticate(config: ModelAuthConfig): Promise<AuthResult>;

  /**
   * Send a request to the model using authenticated connection
   * @param request Model request with messages and parameters
   * @returns Model response
   */
  sendRequest(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Check if this adapter supports streaming responses
   * @returns true if streaming is supported
   */
  supportsStreaming(): boolean;

  /**
   * Get the authentication method type this adapter handles
   * @returns AuthMethodType
   */
  getAuthMethod(): AuthMethodType;

  /**
   * Validate that required dependencies are available
   * @returns Promise resolving to true if dependencies are available, false otherwise
   */
  validateDependencies(): Promise<boolean>;
}
```

### Behavioral Contract

**Preconditions**:
- `config` must be valid `ModelAuthConfig`
- Required dependencies must be available (checked via `validateDependencies()`)

**Postconditions**:
- `authenticate()` returns `AuthResult` with `success: true` or error details
- `sendRequest()` returns valid `ModelResponse` or throws `AuthError`
- Token is cached if authentication succeeds

**Error Handling**:
- Throws `AuthError` with appropriate error code and actionable message
- Provides clear guidance on missing dependencies or configuration

## 2. OpenAPIAdapter Contract

### Interface

```typescript
class OpenAPIAdapter implements ModelAuthAdapter {
  constructor(
    private googleAuth: GoogleAuth,
    private tokenCache: TokenCache
  ) {}

  async authenticate(config: ModelAuthConfig): Promise<AuthResult>;
  async sendRequest(request: ModelRequest): Promise<ModelResponse>;
  supportsStreaming(): boolean; // Returns true
  getAuthMethod(): AuthMethodType; // Returns BEARER_TOKEN
  async validateDependencies(): Promise<boolean>;
}
```

### Authentication Contract

**Input**: `ModelAuthConfig` with:
- `authMethod: BEARER_TOKEN`
- `region: string` (e.g., "us-south1", "global")
- `projectId: string`
- `endpoint?: string` (optional)

**Process**:
1. Use `GoogleAuth` to obtain access token
2. Construct endpoint URL: `https://{region}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{region}/endpoints/openapi/chat/completions`
3. Cache token with expiry time
4. Return `AuthResult` with token

**Output**: `AuthResult` with:
- `success: true`
- `token: string` (bearer token)
- `expiresAt: number` (token expiry timestamp)

**Error Cases**:
- `MISSING_CREDENTIALS`: No valid Google Cloud credentials found
- `INVALID_CREDENTIALS`: Credentials are invalid or expired
- `MISSING_ENV_VAR`: `GOOGLE_CLOUD_PROJECT` not set

### Request Contract

**Input**: `ModelRequest` with:
- `model: string` (model identifier, e.g., "deepseek-ai/deepseek-v3.1-maas")
- `messages: Message[]` (chat messages)
- `stream?: boolean` (optional, defaults to false)

**HTTP Request Format**:
```typescript
POST https://{region}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{region}/endpoints/openapi/chat/completions
Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
Body:
{
  "model": "{modelId}",
  "stream": true/false,
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**Response Format** (non-streaming):
```json
{
  "id": "chatcmpl-...",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Response text"
    }
  }]
}
```

**Response Format** (streaming):
Server-Sent Events (SSE) with chunks:
```
data: {"choices": [{"delta": {"content": "Response"}}]}
data: {"choices": [{"delta": {"content": " text"}}]}
data: [DONE]
```

### Token Refresh Contract

**Trigger**: Token expires within 5 minutes
**Process**:
1. Check cached token expiry
2. If `expiresAt - now < 5 minutes`, refresh token
3. Update cache with new token
4. Continue with request

**Error Handling**: If refresh fails, return `AuthError` with `INVALID_CREDENTIALS`

## 3. ClaudeSDKAdapter Contract

### Interface

```typescript
class ClaudeSDKAdapter implements ModelAuthAdapter {
  constructor(
    private pythonPath: string = 'python3',
    private projectId: string,
    private region: string = 'global'
  ) {}

  async authenticate(config: ModelAuthConfig): Promise<AuthResult>;
  async sendRequest(request: ModelRequest): Promise<ModelResponse>;
  supportsStreaming(): boolean; // Returns true
  getAuthMethod(): AuthMethodType; // Returns CLAUDE_SDK
  async validateDependencies(): Promise<boolean>;
}
```

### Dependency Validation Contract

**Process**:
1. Check if Python executable is available
2. Check if `anthropic` package is installed: `python3 -c "import anthropic"`
3. Return `true` if both available, `false` otherwise

**Error**: Returns `false` if dependencies missing (does not throw)

### Authentication Contract

**Input**: `ModelAuthConfig` with:
- `authMethod: CLAUDE_SDK`
- `region: "global"`
- `projectId: string`

**Process**:
1. Validate dependencies (Python, anthropic package)
2. SDK automatically handles credential discovery from environment
3. No explicit token needed (SDK manages internally)
4. Return `AuthResult` with `success: true`

**Output**: `AuthResult` with:
- `success: true`
- `method: CLAUDE_SDK`
- No token (SDK manages internally)

**Error Cases**:
- `MISSING_DEPENDENCY`: Python or anthropic package not found
- `MISSING_CREDENTIALS`: No valid Google Cloud credentials found
- `MISSING_ENV_VAR`: `GOOGLE_CLOUD_PROJECT` not set

### Request Contract

**Python Script Template**:
```python
#!/usr/bin/env python3
import json
import sys
from anthropic import AnthropicVertex

def main():
    project_id = sys.argv[1]
    region = sys.argv[2]
    model_id = sys.argv[3]
    request_json = sys.stdin.read()
    request = json.loads(request_json)

    client = AnthropicVertex(
        region=region,
        project_id=project_id
    )

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

if __name__ == '__main__':
    main()
```

**Input**: `ModelRequest` serialized as JSON via stdin
**Output**: JSON response via stdout
**Error Output**: Error message via stderr, exit code != 0

## 4. GeminiSDKAdapter Contract

### Interface

```typescript
class GeminiSDKAdapter implements ModelAuthAdapter {
  constructor(
    private pythonPath: string = 'python3',
    private projectId: string,
    private location: string = 'global'
  ) {}

  async authenticate(config: ModelAuthConfig): Promise<AuthResult>;
  async sendRequest(request: ModelRequest): Promise<ModelResponse>;
  supportsStreaming(): boolean; // Returns true
  getAuthMethod(): AuthMethodType; // Returns GEMINI_SDK
  async validateDependencies(): Promise<boolean>;
}
```

### Dependency Validation Contract

**Process**:
1. Check if Python executable is available
2. Check if `google.genai` package is installed: `python3 -c "from google import genai"`
3. Return `true` if both available, `false` otherwise

**Error**: Returns `false` if dependencies missing (does not throw)

### Authentication Contract

**Input**: `ModelAuthConfig` with:
- `authMethod: GEMINI_SDK`
- `region: "global"`
- `projectId: string`

**Process**:
1. Validate dependencies (Python, google-genai package)
2. SDK automatically handles credential discovery when `vertexai=True`
3. No explicit token needed (SDK manages internally)
4. Return `AuthResult` with `success: true`

**Output**: `AuthResult` with:
- `success: true`
- `method: GEMINI_SDK`
- No token (SDK manages internally)

**Error Cases**:
- `MISSING_DEPENDENCY`: Python or google-genai package not found
- `MISSING_CREDENTIALS`: No valid Google Cloud credentials found
- `MISSING_ENV_VAR`: `GOOGLE_CLOUD_PROJECT` not set

### Request Contract

**Python Script Template**:
```python
#!/usr/bin/env python3
import json
import sys
from google import genai

def main():
    project_id = sys.argv[1]
    location = sys.argv[2]
    model_id = sys.argv[3]
    request_json = sys.stdin.read()
    request = json.loads(request_json)

    client = genai.Client(
        vertexai=True,
        project=project_id,
        location=location
    )

    response = client.models.generate_content(
        model=model_id,
        contents=request['contents']
    )

    result = {
        'text': response.text,
        'candidates': [{'content': {'parts': [{'text': part.text}] for part in response.candidates[0].content.parts}}]
    }
    print(json.dumps(result))

if __name__ == '__main__':
    main()
```

**Input**: `ModelRequest` serialized as JSON via stdin
**Output**: JSON response via stdout
**Error Output**: Error message via stderr, exit code != 0

## 5. ModelService Contract

### Interface

```typescript
class ModelService {
  /**
   * Load model configuration from models.yaml
   * @param modelAlias Model alias (e.g., "deepseek-v3")
   * @returns ModelAuthConfig
   */
  getModelConfig(modelAlias: string): Promise<ModelAuthConfig>;

  /**
   * Get appropriate adapter for model's authentication method
   * @param config Model authentication configuration
   * @returns ModelAuthAdapter instance
   */
  getAdapter(config: ModelAuthConfig): ModelAuthAdapter;

  /**
   * Validate model configuration
   * @param config Model authentication configuration
   * @returns Validation result
   */
  validateConfig(config: ModelAuthConfig): ValidationResult;
}
```

### Behavioral Contract

**Adapter Selection**:
- `BEARER_TOKEN` → `OpenAPIAdapter`
- `CLAUDE_SDK` → `ClaudeSDKAdapter`
- `GEMINI_SDK` → `GeminiSDKAdapter`

**Error Handling**:
- Unknown `authMethod` → throws `AuthError` with `INVALID_CONFIG`
- Missing model alias → throws `AuthError` with `INVALID_CONFIG`

## 6. Error Contract

### AuthError Structure

```typescript
class AuthError extends Error {
  code: AuthErrorCode;
  actionableSteps: string[];
  missingDependency?: string;

  constructor(
    code: AuthErrorCode,
    message: string,
    actionableSteps: string[],
    missingDependency?: string
  );
}
```

### Error Code Mapping

| Error Code | HTTP Equivalent | User Action |
|------------|----------------|-------------|
| `MISSING_CREDENTIALS` | 401 | Run `gcloud auth application-default login` |
| `INVALID_CREDENTIALS` | 401 | Refresh credentials or check IAM permissions |
| `MISSING_DEPENDENCY` | 503 | Install required Python package |
| `MISSING_ENV_VAR` | 400 | Set required environment variable |
| `INVALID_CONFIG` | 400 | Fix model configuration in models.yaml |
| `NETWORK_ERROR` | 503 | Check network connectivity, retry |

## 7. Performance Contracts

### Response Time Requirements

- **Bearer Token Authentication**: < 5 seconds
- **SDK Authentication**: < 10 seconds (includes Python process startup)
- **Token Refresh**: < 2 seconds
- **Request Processing**: Model-dependent, but authentication overhead < 1 second

### Caching Requirements

- **Token Cache**: TTL = token expiry - 5 minutes
- **Config Cache**: TTL = application lifetime (reload on config change)
- **Adapter Instances**: Reuse adapters per model (singleton pattern)

## 8. Security Contracts

### Credential Handling

- **Never log tokens or credentials**: Use `[REDACTED]` in logs
- **Secure storage**: Use `HybridTokenStorage` for persistent tokens
- **Token transmission**: HTTPS only, never in query parameters
- **Process isolation**: Python scripts run with minimal permissions

### Input Validation

- **Model alias**: Must match pattern `[a-z0-9-]+`
- **Project ID**: Must match GCP project ID format
- **Region**: Must be valid GCP region
- **Model ID**: Must match expected format for authentication method

## 9. Testing Contracts

### Unit Test Requirements

- Mock `GoogleAuth` for bearer token tests
- Mock Python process execution for SDK tests
- Test all error code paths
- Test token refresh logic
- Test dependency validation

### Integration Test Requirements

- Use real credentials (from test environment)
- Test with actual models (if available in test project)
- Test streaming responses
- Test error recovery scenarios

