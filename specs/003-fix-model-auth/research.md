# Phase 0: Research - Fix Model Authentication Methods

**Feature**: Fix Model Authentication Methods  
**Branch**: `003-fix-model-auth`  
**Date**: January 2025

## Research Overview

This document consolidates research findings from Context7 and best practices for implementing model-specific authentication methods: bearer tokens via OpenAPI endpoints for DeepSeek/Qwen/Kimi models, Claude SDK for Claude Sonnet 4.5, and Gemini SDK with Vertex AI mode for Gemini 2.5 Pro.

## 1. Bearer Token Authentication via OpenAPI Endpoints

### Decision: Use gcloud auth print-access-token for OpenAPI Endpoints

**Rationale**: Based on Context7 research and Vertex AI Node.js SDK patterns, bearer tokens obtained from `gcloud auth print-access-token` provide the most reliable authentication for OpenAPI-compatible endpoints.

**Implementation Details** (from Context7: `/googleapis/nodejs-vertexai`):

- Use `google-auth-library` package's `GoogleAuth` class to obtain bearer tokens
- Tokens are automatically refreshed when expired
- Supports Application Default Credentials (ADC), service accounts, and API keys
- Location: `src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts` (already exists)

**Best Practices** (from Context7):

1. **Token Caching**: Cache tokens with 5-minute buffer before expiration
   ```typescript
   const token = await googleAuth.getAccessToken();
   // Cache token with expiry time - 5 minutes
   ```

2. **Automatic Refresh**: Use `GoogleAuth` client's built-in refresh mechanism
   ```typescript
   const googleAuth = new GoogleAuth({
     scopes: ['https://www.googleapis.com/auth/cloud-platform']
   });
   ```

3. **Endpoint Construction**: Build OpenAPI endpoint URLs with correct region and project
   ```typescript
   const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/endpoints/openapi/chat/completions`;
   ```

4. **Request Format**: Use standard OpenAPI chat completions format
   ```typescript
   const request = {
     model: "deepseek-ai/deepseek-v3.1-maas",
     stream: true,
     messages: [{ role: "user", content: "Hello" }]
   };
   ```

**Models Using This Method**:
- DeepSeek v3.1 (us-south1)
- DeepSeek R1 0528 (us-south1)
- Qwen Coder (us-south1)
- Kimi K2 (global)

## 2. Gemini SDK Authentication with Vertex AI Mode

### Decision: Use google-genai Python SDK with vertexai=True

**Rationale**: Based on Context7 research (`/googleapis/python-genai`), the Google Gen AI Python SDK provides native Vertex AI integration with automatic credential discovery when `vertexai=True` is set.

**Implementation Details** (from Context7):

```python
from google import genai

client = genai.Client(
    vertexai=True,
    project='your-project-id',
    location='global'
)
```

**Best Practices** (from Context7):

1. **Client Initialization**: Always specify `vertexai=True`, `project`, and `location`
   - `location="global"` for Gemini 2.5 Pro
   - SDK automatically discovers credentials from environment

2. **Environment Variables**: Can use environment variables instead of explicit parameters
   ```bash
   export GOOGLE_GENAI_USE_VERTEXAI=true
   export GOOGLE_CLOUD_PROJECT='your-project-id'
   export GOOGLE_CLOUD_LOCATION='global'
   ```
   Then: `client = genai.Client()`

3. **Credential Discovery**: SDK automatically handles:
   - Application Default Credentials (ADC)
   - Service account JSON keys via `GOOGLE_APPLICATION_CREDENTIALS`
   - gcloud CLI credentials

4. **Content Generation**: Use `client.models.generate_content()` method
   ```python
   response = client.models.generate_content(
       model='gemini-2.5-pro',
       contents='Hello, world!'
   )
   ```

5. **Error Handling**: SDK provides clear error messages for missing credentials or configuration

**Integration with Node.js**: Since the CLI is TypeScript/Node.js, we need to:
- Call Python SDK from Node.js using child process or Python bridge
- Or use Node.js equivalent: `@google/genai` SDK (if available for Vertex AI mode)
- **Decision**: Use `@google/genai` Node.js SDK if it supports Vertex AI mode, otherwise bridge to Python

**Models Using This Method**:
- Gemini 2.5 Pro (global)

## 3. Claude SDK Authentication with Vertex AI

### Decision: Use anthropic[vertex] Python SDK

**Rationale**: Based on Context7 research and Anthropic documentation, the `anthropic[vertex]` package provides native Vertex AI integration for Claude models.

**Implementation Details** (from Context7: `/websites/docs_anthropic_com-en-home`):

```python
from anthropic import AnthropicVertex

client = AnthropicVertex(
    region="global",
    project_id="YOUR_PROJECT_ID"
)
```

**Best Practices** (from Context7):

1. **Client Initialization**: Specify `region="global"` and `project_id`
   - SDK automatically discovers credentials from environment
   - Uses same credential discovery as Google Cloud SDKs

2. **Credential Discovery**: Automatically handles:
   - Application Default Credentials (ADC)
   - Service account JSON keys
   - gcloud CLI credentials

3. **Message Creation**: Use standard Anthropic API format
   ```python
   message = client.messages.create(
       max_tokens=1024,
       messages=[{"role": "user", "content": "Hello! Can you help me?"}],
       model="claude-sonnet-4-5@20250929"
   )
   ```

4. **Error Handling**: SDK provides clear error messages for authentication failures

**Integration with Node.js**: Similar to Gemini SDK, we need to:
- Call Python SDK from Node.js using child process or Python bridge
- Or check if Anthropic has Node.js SDK with Vertex AI support
- **Decision**: Bridge to Python SDK using child process execution

**Models Using This Method**:
- Claude Sonnet 4.5 (global)

## 4. Model Configuration and Authentication Routing

### Decision: Extend models.yaml with auth_method field

**Rationale**: Current `models.yaml` already has `auth_method: "bearer_token"` field. We need to extend it to support:
- `bearer_token` for OpenAPI endpoints
- `claude_sdk` for Claude models
- `gemini_sdk` for Gemini models

**Current Structure** (from `src/vtx_cli/configs/models.yaml`):

```yaml
deepseek-v3:
  name: "DeepSeek V3.1"
  endpoint_id: "deepseek-ai/deepseek-v3.1-maas"
  adapter: "gemini"
  region: "us-south1"
  endpoint: "us-south1-aiplatform.googleapis.com"
  api_type: "openapi"
  auth_method: "bearer_token"
```

**Extended Structure**:

```yaml
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

## 5. Adapter Pattern for Model-Specific Authentication

### Decision: Create adapter classes for each authentication method

**Rationale**: Adapter pattern allows clean separation of concerns and makes it easy to add new authentication methods in the future.

**Adapter Structure**:

1. **OpenAPIAdapter**: Handles bearer token authentication for OpenAPI endpoints
   - Location: `src/vtx_cli/packages/cli/src/adapters/openapi-adapter.ts`
   - Responsibilities:
     - Obtain bearer token from `GoogleAuth`
     - Construct OpenAPI endpoint URL
     - Format requests in OpenAPI chat completions format
     - Handle streaming responses

2. **ClaudeSDKAdapter**: Handles Claude SDK authentication
   - Location: `src/vtx_cli/packages/cli/src/adapters/claude-sdk-adapter.ts`
   - Responsibilities:
     - Execute Python script with AnthropicVertex client
     - Pass messages and receive responses
     - Handle errors and credential issues

3. **GeminiSDKAdapter**: Handles Gemini SDK authentication
   - Location: `src/vtx_cli/packages/cli/src/adapters/gemini-sdk-adapter.ts`
   - Responsibilities:
     - Execute Python script with genai.Client (vertexai=True)
     - Pass messages and receive responses
     - Handle errors and credential issues

**Common Interface**:

```typescript
interface ModelAuthAdapter {
  authenticate(config: ModelConfig): Promise<AuthResult>;
  sendRequest(request: ModelRequest): Promise<ModelResponse>;
  supportsStreaming(): boolean;
}
```

## 6. Error Handling and Dependency Management

### Decision: Clear error messages for missing dependencies

**Best Practices**:

1. **SDK Availability Check**: Before attempting SDK-based authentication, check if Python packages are installed
   ```typescript
   async function checkClaudeSDK(): Promise<boolean> {
     try {
       await exec('python3 -c "import anthropic"');
       return true;
     } catch {
       return false;
     }
   }
   ```

2. **Clear Error Messages**: Provide actionable error messages
   ```typescript
   if (!await checkClaudeSDK()) {
     throw new Error(
       'Claude SDK not found. Install with: pip install anthropic[vertex]'
     );
   }
   ```

3. **Credential Validation**: Validate credentials before making requests
   ```typescript
   if (!process.env.GOOGLE_CLOUD_PROJECT) {
     throw new Error(
       'GOOGLE_CLOUD_PROJECT environment variable is required'
     );
   }
   ```

## 7. Token Refresh and Caching

### Decision: Implement token caching with proactive refresh

**Best Practices** (from Context7):

1. **Cache Bearer Tokens**: Cache tokens with expiry time
   ```typescript
   interface CachedToken {
     token: string;
     expiresAt: number; // Unix timestamp in ms
   }
   ```

2. **Proactive Refresh**: Refresh tokens 5 minutes before expiration
   ```typescript
   if (cachedToken.expiresAt - Date.now() < 5 * 60 * 1000) {
     // Refresh token
   }
   ```

3. **SDK Token Management**: SDKs handle token refresh automatically, but we should handle Python process lifecycle

## 8. Streaming Support

### Decision: Support streaming for OpenAPI endpoints

**Best Practices** (from Context7):

1. **Stream Parameter**: Set `stream: true` in request payload for OpenAPI endpoints
   ```typescript
   const request = {
     model: "deepseek-ai/deepseek-v3.1-maas",
     stream: true,  // Enable streaming
     messages: [...]
   };
   ```

2. **Stream Processing**: Process SSE (Server-Sent Events) or chunked responses
   ```typescript
   for await (const chunk of stream) {
     // Process chunk
   }
   ```

3. **SDK Streaming**: SDKs handle streaming automatically via their native methods

## Alternatives Considered

- **Direct REST API calls for all models**: Rejected - SDKs provide better error handling and credential management
- **Single authentication method for all models**: Rejected - Different models require different authentication approaches
- **Node.js-only implementation**: Rejected - Claude and Gemini SDKs are primarily Python-based, requiring Python bridge

## Summary

The research confirms that:
1. Bearer token authentication via OpenAPI endpoints is the standard for DeepSeek, Qwen, and Kimi models
2. SDK-based authentication (Claude SDK, Gemini SDK) provides better integration and error handling
3. Adapter pattern allows clean separation of authentication methods
4. Token caching and proactive refresh improve performance and reliability
5. Clear error messages and dependency checks improve user experience

