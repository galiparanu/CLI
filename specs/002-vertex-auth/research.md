# Phase 0: Research - Vertex AI Authentication Improvement

**Feature**: Vertex AI Authentication Improvement  
**Branch**: `002-vertex-auth`  
**Date**: November 16, 2025

## Research Overview

This document consolidates research findings for implementing improved Vertex AI authentication supporting multiple authentication methods (ADC, service account, API key) with automatic detection and credential refresh.

## 1. Vertex AI Model Authentication Methods

### Decision: Support Three Authentication Methods

**Rationale**: Google Cloud provides three standard authentication methods for Vertex AI, each suited for different deployment scenarios.

### Method 1: Application Default Credentials (ADC)

**Use Case**: Development environments with gcloud CLI installed

**Implementation Details**:

- Uses `google-auth-library` package's `GoogleAuth` class
- Automatically discovers credentials from environment:
  1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable
  2. gcloud CLI configuration (`~/.config/gcloud/`)
  3. Compute Engine/GKE service account (when running in GCP)
- Already implemented in codebase via `GoogleCredentialProvider` class
- Location: `src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts`

**Best Practices**:

- Cache tokens with 5-minute buffer before expiration
- Use `getAccessToken()` to obtain bearer tokens
- Implement automatic refresh via `GoogleAuth` client

### Method 2: Service Account JSON Key

**Use Case**: CI/CD pipelines, production deployments, restricted environments

**Implementation Details**:

- Requires `GOOGLE_APPLICATION_CREDENTIALS` pointing to JSON key file
- JSON contains: `type`, `project_id`, `private_key_id`, `private_key`, `client_email`
- Required IAM role: "Vertex AI User" (roles/aiplatform.user)
- Already supported via ADC mechanism (GoogleAuth auto-detects JSON key)

**Best Practices**:

- Validate JSON file existence and format at startup
- Never log or expose private key
- Support both relative and absolute paths
- Provide clear error if file not found or malformed

### Method 3: Google Cloud API Key

**Use Case**: Quick setup, express mode, testing environments

**Implementation Details**:

- Uses `GOOGLE_API_KEY` environment variable
- Simpler than ADC but organization policies may restrict usage
- Already implemented in codebase via `apiKeyCredentialStorage.ts`
- Requires Vertex AI API enabled for the key

**Best Practices**:

- Validate API key format (expected length/pattern)
- Handle "API keys not supported" error gracefully
- Store securely using `HybridTokenStorage` (keychain or encrypted file)

**Alternatives Considered**:

- OAuth2 personal login: Already implemented for Gemini API, but not primary for Vertex AI production use
- Workload Identity Federation: Too complex for initial implementation, can be added later

## 2. Authentication Method Detection & Priority

### Decision: Environment-Based Auto-Detection with Clear Priority

**Detection Order** (highest to lowest priority):

1. `GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true` → API key mode
2. `GOOGLE_APPLICATION_CREDENTIALS` → Service account JSON key
3. `gcloud auth application-default login` credentials → ADC
4. GCE/GKE metadata service → Compute default credentials

**Rationale**: Explicit configuration (API key, explicit JSON path) should override implicit configuration (ADC, compute metadata)

**Implementation Location**:

- `src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts` - Already has `getAuthTypeFromEnv()`
- `src/vtx_cli/packages/core/src/code_assist/oauth2.ts` - Credential initialization

**Best Practices**:

- Log detected method at DEBUG level for troubleshooting
- Fail fast if required environment variables are missing
- Provide actionable error messages for each failure mode

## 3. Multi-Model Endpoint Authentication

### Decision: Unified Authentication for All Vertex AI Models

Based on the provided examples, Vertex AI models use consistent authentication patterns:

**Gemini 2.5 Pro**:

- SDK: `@google/genai` with `vertexai=true`
- Endpoint: `{region}-aiplatform.googleapis.com` or `global`
- Auth: ADC or API key via SDK

**Claude Sonnet 4.5**:

- SDK: `anthropic[vertex]` (Python) or Vertex AI REST API
- Endpoint: `global` region
- Auth: ADC via `AnthropicVertex` client
- TypeScript Implementation: Use native Vertex AI SDK or REST API with bearer token

**DeepSeek, Qwen, Kimi (OpenAI-compatible)**:

- Endpoint pattern: `https://{ENDPOINT}/v1/projects/{PROJECT_ID}/locations/{REGION}/endpoints/openapi/chat/completions`
- Auth: `Authorization: Bearer $(gcloud auth print-access-token)`
- Models:
  - `deepseek-ai/deepseek-v3.1-maas`
  - `deepseek-ai/deepseek-r1-0528-maas`
  - `qwen/qwen3-coder-480b-a35b-instruct-maas`
  - `moonshotai/kimi-k2-thinking-maas`

**Unified Approach**:

- All models require bearer token from ADC/service account/API key
- Token obtained via `google-auth-library`'s `getAccessToken()`
- Token included in `Authorization: Bearer {token}` header
- Existing implementation in `VertexAiContentGenerator` already handles this

**Best Practices**:

- Reuse single authentication client across all model requests
- Cache access token (valid for ~1 hour) to avoid repeated auth calls
- Handle regional vs global endpoints correctly per model

## 4. Credential Refresh Strategy

### Decision: Proactive Token Refresh with Expiration Tracking

**Rationale**: Prevents mid-request authentication failures during long-running sessions

**Implementation Strategy**:

1. **Token Caching**: Store token and expiration time
2. **Proactive Refresh**: Refresh 5 minutes before expiration
3. **Lazy Refresh**: Refresh on-demand if cache expired
4. **Error Recovery**: Retry once on 401/403 with fresh token

**Existing Implementation**:

- `GoogleCredentialProvider` (line 72-108): Already implements caching with `FIVE_MIN_BUFFER_MS`
- Pattern to replicate for other auth methods

**Code Pattern**:

```typescript
const FIVE_MIN_BUFFER_MS = 5 * 60 * 1000;

async tokens(): Promise<OAuthTokens | undefined> {
  // Check cache validity
  if (this.cachedToken && this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS) {
    return this.cachedToken;
  }

  // Refresh token
  const client = await this.auth.getClient();
  const accessTokenResponse = await client.getAccessToken();

  // Cache new token
  this.cachedToken = { access_token: accessTokenResponse.token, ... };
  this.tokenExpiryTime = client.credentials?.expiry_date;

  return this.cachedToken;
}
```

**Best Practices**:

- Never block requests waiting for refresh (use cached if close to expiry)
- Log refresh events at DEBUG level
- Clear cache on explicit logout/credential change

## 5. Error Messaging & Validation

### Decision: Structured Error Messages with Remediation Steps

**Error Categories**:

1. **Missing Environment Variables**:

   ```
   When using Vertex AI, you must specify either:
   • GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.
   • GOOGLE_API_KEY environment variable (if using express mode).
   Update your environment and try again (no reload needed if using .env)!
   ```

   - Already implemented in `src/vtx_cli/packages/cli/src/config/auth.ts`

2. **Invalid Credentials**:

   ```
   Authentication failed: Invalid service account key file.
   • Verify GOOGLE_APPLICATION_CREDENTIALS points to valid JSON file
   • Ensure the service account has "Vertex AI User" role
   • Check file permissions are readable
   ```

3. **Insufficient Permissions**:

   ```
   Authentication failed: Permission denied accessing Vertex AI.
   • Required IAM role: "Vertex AI User" (roles/aiplatform.user)
   • Grant role: gcloud projects add-iam-policy-binding PROJECT_ID \
       --member="serviceAccount:SA_EMAIL" --role="roles/aiplatform.user"
   ```

4. **API Not Enabled**:
   ```
   Vertex AI API not enabled for project PROJECT_ID.
   • Enable API: gcloud services enable aiplatform.googleapis.com --project=PROJECT_ID
   • Or visit: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
   ```

**Implementation Location**:

- `src/vtx_cli/packages/cli/src/config/auth.ts` - `validateAuthMethod()` function
- Add detailed error parsing in credential initialization functions

**Best Practices**:

- Include actionable steps in every error message
- Preserve original error details in DEBUG logs
- Detect specific error codes (401, 403, 404) and provide targeted guidance

## 6. Environment Configuration Validation

### Decision: Validate Required Variables at Startup

**Required Variables by Method**:

**ADC/Service Account**:

- `GOOGLE_CLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT_ID` (either)
- `GOOGLE_CLOUD_LOCATION` (e.g., `us-central1`, `global`)
- `GOOGLE_APPLICATION_CREDENTIALS` (optional, for explicit service account path)

**API Key**:

- `GOOGLE_API_KEY`
- `GOOGLE_GENAI_USE_VERTEXAI=true` (to indicate Vertex AI mode)

**Validation Rules**:

1. **Empty String Check**: `process.env.VAR || undefined` (treat empty as unset)
2. **Region Validation**: Verify location is valid GCP region or "global"
3. **Path Validation**: Check `GOOGLE_APPLICATION_CREDENTIALS` file exists and is readable
4. **API Key Format**: Basic format check (length, character set)

**Implementation**:

```typescript
function validateVertexAIConfig(): ValidationResult {
  const hasProjectConfig =
    !!process.env["GOOGLE_CLOUD_PROJECT"] &&
    !!process.env["GOOGLE_CLOUD_LOCATION"];
  const hasApiKey = !!process.env["GOOGLE_API_KEY"];

  if (!hasProjectConfig && !hasApiKey) {
    return {
      valid: false,
      error: "Missing required Vertex AI configuration...",
    };
  }

  // Validate service account file if specified
  const credPath = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
  if (credPath && !fs.existsSync(credPath)) {
    return {
      valid: false,
      error: `Service account file not found: ${credPath}`,
    };
  }

  return { valid: true };
}
```

**Best Practices**:

- Validate at application startup before any API calls
- Log configuration summary at startup (DEBUG level)
- Support `.env` file loading via `dotenv` (already in codebase)

## 7. Cross-Platform & Environment Compatibility

### Decision: Support Interactive and Non-Interactive Environments

**Environment Types**:

1. **Interactive Development**: Local machines with gcloud CLI
2. **CI/CD Pipelines**: GitHub Actions, GitLab CI, Jenkins
3. **Containers**: Docker, Kubernetes
4. **Cloud Platforms**: GCE, Cloud Run, GKE

**Implementation Strategy**:

**Non-Interactive Detection**:

- Already implemented: `validateNonInteractiveAuth()` in codebase
- Check for `CI` environment variable or stdin TTY status

**Credential Sources by Environment**:

- **Local Dev**: ADC from gcloud or API key
- **CI/CD**: Service account via secrets/environment
- **Containers**: Mounted service account JSON or Workload Identity
- **GCE/GKE**: Metadata service (automatic)

**Container Best Practices**:

- Mount service account JSON as volume (not in image)
- Use `--env-file` for environment variables
- Support Docker secrets for sensitive values

**Existing Implementation**:

- `validateNonInterActiveAuth.ts` already handles this
- Extend with better error messages for container scenarios

## 8. Secure Credential Storage

### Decision: Use Existing HybridTokenStorage with Enhancements

**Current Implementation**:

- `HybridTokenStorage` class in `src/vtx_cli/packages/core/src/mcp/token-storage/`
- Supports macOS Keychain, Windows Credential Manager, encrypted files on Linux
- Already used for OAuth credentials and API keys

**Enhancements Needed**:

1. **Separate Namespaces**: Different service names for different credential types

   - `gemini-cli-oauth` (existing)
   - `gemini-cli-api-key` (existing)
   - `gemini-cli-vertex-token` (new, for cached access tokens)

2. **Token Lifecycle**:

   - Store access tokens with expiration metadata
   - Clear tokens on explicit logout
   - Never store service account private keys (only path reference)

3. **Security Principles**:
   - Use OS keychain when available
   - Fall back to encrypted file storage
   - Never log credential values
   - Clear cache on permission errors

**Best Practices**:

- Rely on OS security for credential storage
- Document manual credential clearing for troubleshooting
- Provide `--clear-auth` flag to force re-authentication

## Summary of Decisions

| Research Area          | Decision                              | Implementation Priority |
| ---------------------- | ------------------------------------- | ----------------------- |
| Auth Methods           | Support ADC, Service Account, API Key | P1 (Required)           |
| Detection Order        | API Key > Explicit SA > ADC > Compute | P1 (Required)           |
| Multi-Model Support    | Unified bearer token approach         | P1 (Required)           |
| Token Refresh          | 5-min proactive refresh with caching  | P1 (Required)           |
| Error Messages         | Structured with remediation steps     | P2 (High value)         |
| Environment Validation | Startup validation with clear errors  | P2 (High value)         |
| Cross-Platform         | Support all deployment environments   | P1 (Required)           |
| Credential Storage     | Enhance HybridTokenStorage            | P2 (Security)           |

## Next Steps

Phase 1 will focus on:

1. Data model definition for authentication entities
2. API contracts for authentication flows
3. Quickstart guide for developers
4. Update agent context with findings
