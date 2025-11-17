# Phase 1: Data Model - Fix Model Authentication Methods

**Feature**: Fix Model Authentication Methods  
**Branch**: `003-fix-model-auth`  
**Date**: January 2025

## Overview

This document defines the data entities, their relationships, and state management for model-specific authentication methods in the CLI.

## Core Entities

### 1. ModelAuthConfig

Represents the authentication configuration for a specific model.

**Fields**:

- `modelAlias: string` - The model alias from models.yaml (e.g., "deepseek-v3", "claude-sonnet")
- `authMethod: AuthMethodType` - The authentication method to use
- `region: string` - GCP region (e.g., "us-south1", "global")
- `endpoint?: string` - Custom endpoint domain (optional)
- `projectId: string` - Google Cloud project ID
- `modelId: string` - The actual model identifier (e.g., "deepseek-ai/deepseek-v3.1-maas")

**Location**: `src/vtx_cli/packages/core/src/services/modelService.ts`

**Relationships**:

- Loaded from `models.yaml` configuration
- Used by authentication adapters to determine auth strategy
- Validated by `validateModelAuthConfig()` function

### 2. AuthMethodType

Enumeration of supported authentication methods per model.

**Fields**:

- `BEARER_TOKEN`: Bearer token via OpenAPI endpoint (DeepSeek, Qwen, Kimi)
- `CLAUDE_SDK`: Claude SDK authentication (Claude Sonnet 4.5)
- `GEMINI_SDK`: Gemini SDK with Vertex AI mode (Gemini 2.5 Pro)

**Location**: `src/vtx_cli/packages/core/src/auth/AuthMethodType.ts` (new file)

**Relationships**:

- Used by `ModelAuthConfig` to determine which adapter to use
- Validated by `validateAuthMethod()` function
- Mapped from `models.yaml` `auth_method` field

### 3. BearerTokenAuth

Represents bearer token authentication for OpenAPI endpoints.

**Fields**:

- `token: string` - The bearer token value
- `expiresAt: number` - Unix timestamp (ms) when token expires
- `region: string` - GCP region for endpoint construction
- `endpoint: string` - Full endpoint URL
- `projectId: string` - Google Cloud project ID

**Validation Rules**:

- `token` must be non-empty string
- `expiresAt` must be future timestamp
- `endpoint` must be valid URL format
- `projectId` must be non-empty string

**Lifecycle**:

```
[Load Config] → [Get Credentials] → [Obtain Token] → [Cache Token] → [Use Token] → [Refresh if Needed]
```

**Location**: `src/vtx_cli/packages/core/src/auth/BearerTokenAuth.ts` (new file)

### 4. SDKAuthConfig

Represents SDK-based authentication configuration.

**Fields**:

- `sdkType: 'claude' | 'gemini'` - Which SDK to use
- `region: string` - GCP region (typically "global")
- `projectId: string` - Google Cloud project ID
- `modelId: string` - Model identifier for the SDK
- `pythonPath?: string` - Path to Python executable (optional, defaults to "python3")

**Validation Rules**:

- `sdkType` must be one of the supported types
- `region` must be non-empty string
- `projectId` must be non-empty string
- `modelId` must be non-empty string

**Location**: `src/vtx_cli/packages/core/src/auth/SDKAuthConfig.ts` (new file)

**Relationships**:

- Used by SDK adapters to configure Python SDK clients
- Validated before executing Python scripts

### 5. CachedToken

Represents a cached authentication token with expiry information.

**Fields**:

- `token: string` - The actual token value
- `expiresAt: number` - Unix timestamp (ms) when token expires
- `tokenType: 'Bearer'` - Token type for Authorization header
- `refreshBuffer: number` - Milliseconds before expiry to refresh (default: 5 minutes)

**Validation Rules**:

- `token` must be non-empty string
- `expiresAt` must be future timestamp
- `tokenType` must be 'Bearer'
- `refreshBuffer` must be positive number

**State Transitions**:

```
[Valid] → [Near Expiry] → [Refresh] → [Valid]
[Valid] → [Expired] → [Error] → [Refresh] → [Valid]
```

**Location**: `src/vtx_cli/packages/core/src/auth/CachedToken.ts` (new file)

### 6. ModelAuthAdapter

Interface for model-specific authentication adapters.

**Fields** (interface methods):

- `authenticate(config: ModelAuthConfig): Promise<AuthResult>`
- `sendRequest(request: ModelRequest): Promise<ModelResponse>`
- `supportsStreaming(): boolean`
- `getAuthMethod(): AuthMethodType`

**Location**: `src/vtx_cli/packages/core/src/auth/ModelAuthAdapter.ts` (new file)

**Implementations**:

- `OpenAPIAdapter` - For bearer token authentication
- `ClaudeSDKAdapter` - For Claude SDK authentication
- `GeminiSDKAdapter` - For Gemini SDK authentication

### 7. AuthResult

Result of authentication attempt.

**Fields**:

- `success: boolean` - Whether authentication succeeded
- `token?: string` - Bearer token (if applicable)
- `expiresAt?: number` - Token expiry timestamp (if applicable)
- `error?: AuthError` - Error information if authentication failed
- `method: AuthMethodType` - Authentication method used

**Location**: `src/vtx_cli/packages/core/src/auth/AuthResult.ts` (new file)

### 8. AuthError

Represents authentication errors with actionable messages.

**Fields**:

- `code: AuthErrorCode` - Error code for programmatic handling
- `message: string` - Human-readable error message
- `actionableSteps: string[]` - Steps user can take to resolve
- `missingDependency?: string` - Missing dependency (e.g., "anthropic[vertex]")

**Error Codes**:

- `MISSING_CREDENTIALS`: No credentials found
- `INVALID_CREDENTIALS`: Credentials are invalid or expired
- `MISSING_DEPENDENCY`: Required SDK or tool not installed
- `MISSING_ENV_VAR`: Required environment variable not set
- `INVALID_CONFIG`: Model configuration is invalid
- `NETWORK_ERROR`: Network error during authentication

**Location**: `src/vtx_cli/packages/core/src/auth/AuthError.ts` (new file)

## State Management

### Authentication Flow State Machine

```
[Idle]
  ↓
[Load Model Config]
  ↓
[Determine Auth Method]
  ↓
[Check Dependencies] → [Missing] → [Error: MISSING_DEPENDENCY]
  ↓ [Available]
[Get Credentials]
  ↓
[Authenticate] → [Failure] → [Error: INVALID_CREDENTIALS]
  ↓ [Success]
[Cache Token/Config]
  ↓
[Ready for Requests]
  ↓
[Send Request] → [Token Expired] → [Refresh Token] → [Ready for Requests]
  ↓ [Success]
[Return Response]
```

### Token Refresh State Machine

```
[Token Valid]
  ↓
[Check Expiry] → [Not Near Expiry] → [Token Valid]
  ↓ [Near Expiry (< 5 min)]
[Refresh Token]
  ↓
[Success] → [Update Cache] → [Token Valid]
  ↓ [Failure]
[Error: INVALID_CREDENTIALS]
```

## Relationships

### Entity Relationship Diagram

```
ModelAuthConfig
  ├── uses → AuthMethodType
  ├── contains → BearerTokenAuth (if authMethod = BEARER_TOKEN)
  └── contains → SDKAuthConfig (if authMethod = CLAUDE_SDK | GEMINI_SDK)

BearerTokenAuth
  ├── produces → CachedToken
  └── uses → GoogleAuth (from google-auth-library)

SDKAuthConfig
  ├── used by → ClaudeSDKAdapter
  └── used by → GeminiSDKAdapter

ModelAuthAdapter (interface)
  ├── implemented by → OpenAPIAdapter
  ├── implemented by → ClaudeSDKAdapter
  └── implemented by → GeminiSDKAdapter

AuthResult
  ├── contains → CachedToken (if success)
  └── contains → AuthError (if failure)
```

## Data Flow

### Bearer Token Authentication Flow

1. **Load Config**: Read `models.yaml` → `ModelAuthConfig`
2. **Get Credentials**: Use `GoogleAuth` → Obtain credentials
3. **Get Token**: Call `getAccessToken()` → Bearer token
4. **Cache Token**: Store in `CachedToken` with expiry
5. **Use Token**: Include in `Authorization: Bearer {token}` header
6. **Refresh**: Check expiry, refresh if needed

### SDK Authentication Flow

1. **Load Config**: Read `models.yaml` → `ModelAuthConfig`
2. **Validate SDK**: Check if Python package installed
3. **Prepare Script**: Generate Python script with SDK client
4. **Execute Script**: Run Python script via child process
5. **Parse Response**: Extract response from script output
6. **Handle Errors**: Map Python errors to `AuthError`

## Validation Rules

### ModelAuthConfig Validation

- `modelAlias` must exist in `models.yaml`
- `authMethod` must be valid `AuthMethodType`
- `region` must be non-empty string
- `projectId` must be set (from env var or config)
- `modelId` must match format expected by authentication method

### BearerTokenAuth Validation

- Token must be obtained before use
- Endpoint URL must be constructable from region and projectId
- Token expiry must be in the future

### SDKAuthConfig Validation

- Python executable must be available
- Required Python package must be installed
- Project ID and region must be valid

## Error Handling

### Error Propagation

```
[Adapter] → [AuthError] → [AuthResult] → [ContentGenerator] → [User]
```

### Error Recovery

- **MISSING_DEPENDENCY**: Provide installation instructions
- **INVALID_CREDENTIALS**: Suggest credential refresh steps
- **MISSING_ENV_VAR**: List required environment variables
- **NETWORK_ERROR**: Retry with exponential backoff

## Performance Considerations

- **Token Caching**: Reduces authentication API calls
- **Proactive Refresh**: Prevents request failures due to expired tokens
- **SDK Process Reuse**: Consider keeping Python processes alive for multiple requests (future optimization)
- **Lazy Loading**: Load authentication config only when model is accessed

