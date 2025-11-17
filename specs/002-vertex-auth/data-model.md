# Phase 1: Data Model - Vertex AI Authentication Improvement

**Feature**: Vertex AI Authentication Improvement  
**Branch**: `002-vertex-auth`  
**Date**: November 16, 2025

## Overview

This document defines the data entities, their relationships, and state management for the Vertex AI authentication system.

## Core Entities

### 1. AuthenticationType

Enumeration of supported authentication methods for Vertex AI.

**Fields**:

- `LOGIN_WITH_GOOGLE`: OAuth2 personal Google account login
- `USE_GEMINI`: Gemini API key authentication
- `USE_VERTEX_AI`: Vertex AI authentication (ADC, service account, or API key)
- `LEGACY_CLOUD_SHELL`: Legacy Cloud Shell authentication
- `COMPUTE_ADC`: Compute Engine/GKE default credentials

**Location**: Already defined in `src/vtx_cli/packages/core/src/core/contentGenerator.ts`

**Relationships**:

- Used by `ContentGeneratorConfig` to determine auth strategy
- Validated by `validateAuthMethod()` function
- Detected by `getAuthTypeFromEnv()` function

### 2. CredentialSource

Enumeration of where credentials originate.

**Fields**:

- `API_KEY`: From GOOGLE_API_KEY environment variable
- `SERVICE_ACCOUNT_FILE`: From GOOGLE_APPLICATION_CREDENTIALS JSON file
- `ADC_GCLOUD`: From gcloud CLI configuration
- `COMPUTE_METADATA`: From GCE/GKE metadata service
- `OAUTH_CACHED`: From cached OAuth tokens

**Purpose**: Track credential provenance for debugging and logging

**State Transitions**:

```
[Environment Scan] → [Detect Source] → [Validate Credentials] → [Cache Token]
```

### 3. AccessToken

Represents a temporary bearer token for API authentication.

**Fields**:

- `token: string` - The actual bearer token value
- `expiryTime: number | undefined` - Unix timestamp (ms) when token expires
- `tokenType: 'Bearer'` - Token type for Authorization header
- `scope?: string[]` - OAuth scopes if applicable

**Validation Rules**:

- `token` must be non-empty string
- `expiryTime` if present must be future timestamp
- `tokenType` must always be 'Bearer'

**Lifecycle**:

1. **Acquisition**: Obtained from credential source via `getAccessToken()`
2. **Caching**: Stored in memory with expiry time
3. **Usage**: Included in API requests as `Authorization: Bearer {token}`
4. **Refresh**: Proactively renewed 5 minutes before expiry
5. **Invalidation**: Cleared on logout or credential change

**Relationships**:

- Created by `GoogleAuth.getAccessToken()` or `OAuth2Client.getAccessToken()`
- Cached by `GoogleCredentialProvider` or credential storage
- Used by all Vertex AI API requests

### 4. EnvironmentConfiguration

Configuration derived from environment variables.

**Fields**:

- `googleCloudProject: string | undefined` - GCP project ID
- `googleCloudLocation: string | undefined` - GCP region (e.g., 'us-central1', 'global')
- `googleApiKey: string | undefined` - API key for express mode
- `googleApplicationCredentials: string | undefined` - Path to service account JSON
- `useVertexAI: boolean` - Whether Vertex AI mode is enabled

**Validation Rules**:

- If `useVertexAI` is true, must have (`googleCloudProject` AND `googleCloudLocation`) OR `googleApiKey`
- `googleCloudLocation` must be valid GCP region or 'global'
- `googleApplicationCredentials` if set must point to readable JSON file

**Derivation**:

```typescript
{
  googleCloudProject: process.env['GOOGLE_CLOUD_PROJECT'] ||
                      process.env['GOOGLE_CLOUD_PROJECT_ID'],
  googleCloudLocation: process.env['GOOGLE_CLOUD_LOCATION'] || 'us-central1',
  googleApiKey: process.env['GOOGLE_API_KEY'],
  googleApplicationCredentials: process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  useVertexAI: process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true'
}
```

**Relationships**:

- Feeds into `ContentGeneratorConfig` creation
- Validated by `validateAuthMethod()`
- Used by `createContentGeneratorConfig()`

### 5. CredentialCache

In-memory cache for authentication tokens.

**Fields**:

- `cachedToken: AccessToken | undefined` - Cached access token
- `tokenExpiryTime: number | undefined` - Expiration timestamp
- `credentialSource: CredentialSource` - Source of credentials
- `lastRefreshTime: number` - When token was last refreshed

**Behavior**:

- **Cache Hit**: Return cached token if `Date.now() < tokenExpiryTime - FIVE_MIN_BUFFER_MS`
- **Cache Miss**: Fetch new token and update cache
- **Refresh Trigger**: 5 minutes before expiration
- **Invalidation**: On credential change, logout, or explicit clear

**Implementation Pattern**:

```typescript
class CredentialCache {
  private cachedToken?: AccessToken;
  private tokenExpiryTime?: number;

  async getToken(fetcher: () => Promise<AccessToken>): Promise<AccessToken> {
    if (this.isValid()) {
      return this.cachedToken!;
    }

    const newToken = await fetcher();
    this.cachedToken = newToken;
    this.tokenExpiryTime = newToken.expiryTime;
    return newToken;
  }

  private isValid(): boolean {
    return (
      this.cachedToken !== undefined &&
      this.tokenExpiryTime !== undefined &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
    );
  }

  clear(): void {
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;
  }
}
```

### 6. AuthenticationError

Structured error for authentication failures.

**Fields**:

- `code: string` - Error code (e.g., 'MISSING_ENV', 'INVALID_CREDENTIALS', 'PERMISSION_DENIED')
- `message: string` - Human-readable error description
- `remediationSteps: string[]` - Actionable steps to fix the error
- `originalError?: Error` - Underlying error object

**Error Codes**:

- `MISSING_ENV`: Required environment variables not set
- `INVALID_CREDENTIALS`: Credentials are malformed or expired
- `PERMISSION_DENIED`: Credentials lack necessary IAM permissions
- `API_NOT_ENABLED`: Vertex AI API not enabled for project
- `INVALID_JSON`: Service account JSON file is malformed
- `FILE_NOT_FOUND`: Service account JSON file does not exist
- `NETWORK_ERROR`: Unable to reach Google Cloud authentication endpoints

**Example**:

```typescript
{
  code: 'MISSING_ENV',
  message: 'When using Vertex AI, you must specify either GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION or GOOGLE_API_KEY',
  remediationSteps: [
    'Set GOOGLE_CLOUD_PROJECT environment variable',
    'Set GOOGLE_CLOUD_LOCATION environment variable (e.g., us-central1)',
    'OR set GOOGLE_API_KEY for express mode',
    'Update your .env file or export variables in your shell'
  ]
}
```

## Entity Relationships

```
AuthenticationType ──> EnvironmentConfiguration
        │                      │
        │                      ↓
        │              [Validation]
        │                      │
        ↓                      ↓
CredentialSource ──> AccessToken ──> CredentialCache
        │                      │
        │                      ↓
        └──────────> [Vertex AI API Requests]
                             │
                             ↓
                    AuthenticationError
                    (on failure)
```

## State Transitions

### Authentication Flow State Machine

```
[UNINITIALIZED]
     │
     ├─→ Detect Auth Type from Environment
     │
     ↓
[DETECTING]
     │
     ├─→ Found API Key → [API_KEY_MODE]
     ├─→ Found Service Account → [SERVICE_ACCOUNT_MODE]
     ├─→ Found ADC → [ADC_MODE]
     ├─→ None Found → [ERROR: MISSING_CREDENTIALS]
     │
     ↓
[AUTH_METHOD_SELECTED]
     │
     ├─→ Validate Configuration
     │
     ↓
[VALIDATING]
     │
     ├─→ Valid → [ACQUIRING_TOKEN]
     ├─→ Invalid → [ERROR: INVALID_CONFIG]
     │
     ↓
[ACQUIRING_TOKEN]
     │
     ├─→ Token Acquired → [AUTHENTICATED]
     ├─→ Acquisition Failed → [ERROR: AUTH_FAILED]
     │
     ↓
[AUTHENTICATED]
     │
     ├─→ Token Near Expiry → [REFRESHING]
     ├─→ Make API Request → [IN_USE]
     ├─→ Logout → [UNINITIALIZED]
     │
     ↓
[REFRESHING]
     │
     ├─→ Refresh Success → [AUTHENTICATED]
     ├─→ Refresh Failed → [ERROR: REFRESH_FAILED]
```

### Token Lifecycle

```
[NO_TOKEN]
     │
     ├─→ Request Token
     │
     ↓
[FETCHING]
     │
     ├─→ Success → [CACHED_VALID]
     ├─→ Failure → [ERROR]
     │
     ↓
[CACHED_VALID]
     │
     ├─→ Time passes
     │
     ↓
[CACHED_NEAR_EXPIRY] (< 5 min remaining)
     │
     ├─→ Proactive Refresh
     │
     ↓
[REFRESHING]
     │
     ├─→ Success → [CACHED_VALID]
     ├─→ Failure → [CACHED_EXPIRED] → [FETCHING]
```

## Data Storage

### Persistent Storage

**API Keys** (if configured):

- Storage: OS Keychain or encrypted file via `HybridTokenStorage`
- Service: `gemini-cli-api-key`
- Key: `default-api-key`
- Location: `~/.gemini/` (encrypted) or OS keychain

**OAuth Credentials** (if used):

- Storage: OS Keychain or encrypted file via `OAuthCredentialStorage`
- Service: `gemini-cli-oauth`
- Key: `main-account`
- Location: `~/.gemini/oauth_creds.json` or OS keychain

### Transient Storage

**Access Tokens**:

- Storage: In-memory only (never persisted)
- Lifetime: Until expiry (~1 hour) or application exit
- Reason: Security - tokens should not be written to disk

**Environment Configuration**:

- Storage: Read from environment variables on startup
- Cached: In memory for duration of application run
- Never persisted

## Validation Rules

### Environment Variable Validation

```typescript
interface ValidationRule {
  variable: string;
  required: boolean;
  validator: (value: string | undefined) => boolean;
  errorMessage: string;
}

const validationRules: ValidationRule[] = [
  {
    variable: "GOOGLE_CLOUD_PROJECT",
    required: true, // unless GOOGLE_API_KEY is set
    validator: (v) => !!v && v.length > 0,
    errorMessage: "GOOGLE_CLOUD_PROJECT must be non-empty",
  },
  {
    variable: "GOOGLE_CLOUD_LOCATION",
    required: true, // unless GOOGLE_API_KEY is set
    validator: (v) => !!v && /^[a-z]+-[a-z]+\d+$|^global$/.test(v),
    errorMessage: 'GOOGLE_CLOUD_LOCATION must be valid GCP region or "global"',
  },
  {
    variable: "GOOGLE_APPLICATION_CREDENTIALS",
    required: false,
    validator: (v) => !v || fs.existsSync(v),
    errorMessage: "GOOGLE_APPLICATION_CREDENTIALS file must exist",
  },
  {
    variable: "GOOGLE_API_KEY",
    required: false,
    validator: (v) => !v || (v.length >= 30 && /^[A-Za-z0-9_-]+$/.test(v)),
    errorMessage: "GOOGLE_API_KEY has invalid format",
  },
];
```

### Service Account JSON Validation

```typescript
interface ServiceAccountJson {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

function validateServiceAccountJson(json: unknown): json is ServiceAccountJson {
  return (
    typeof json === "object" &&
    json !== null &&
    "type" in json &&
    json.type === "service_account" &&
    "project_id" in json &&
    typeof json.project_id === "string" &&
    "private_key" in json &&
    typeof json.private_key === "string" &&
    "client_email" in json &&
    typeof json.client_email === "string"
  );
}
```

## Performance Characteristics

### Token Caching Impact

- **Without Cache**: ~200-500ms per authentication request
- **With Cache**: <1ms (memory lookup)
- **Cache Hit Rate**: Expected >99% for typical sessions
- **Memory Overhead**: ~2KB per cached token

### Token Refresh Timing

- **Proactive Refresh**: 5 minutes before expiration
- **Refresh Duration**: ~100-300ms
- **User Impact**: Zero (happens in background)
- **Failure Handling**: Fall back to immediate refresh on next request

## Security Considerations

### Credential Protection

1. **Never Log Credentials**:

   - Tokens, API keys, private keys must never appear in logs
   - Use `[REDACTED]` placeholder in debug output

2. **Secure Storage**:

   - Use OS keychain when available
   - Encrypt files when keychain unavailable
   - Set restrictive file permissions (0600)

3. **Token Lifetime**:

   - Never persist access tokens to disk
   - Clear from memory on application exit
   - Invalidate on explicit logout

4. **Service Account Keys**:
   - Never include in version control
   - Document .gitignore patterns
   - Recommend secret management systems for production

### Attack Surface Mitigation

- **Path Traversal**: Validate GOOGLE_APPLICATION_CREDENTIALS is absolute or relative to safe directory
- **Environment Injection**: Sanitize environment variables before use
- **Token Leakage**: Clear sensitive data from memory on errors
- **MITM**: Use HTTPS for all authentication endpoints (enforced by google-auth-library)

## Next Steps

This data model will be used to:

1. Define API contracts for authentication flows
2. Implement credential validation logic
3. Create test scenarios for each entity state
4. Generate quickstart documentation
