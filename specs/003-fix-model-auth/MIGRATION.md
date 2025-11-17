# Migration Guide: Model Authentication Methods

This guide helps you migrate existing model configurations to use the new authentication method system.

## Overview

The authentication system has been updated to support multiple authentication methods:
- `bearer_token`: OpenAPI endpoints with bearer token authentication
- `claude_sdk`: Anthropic Vertex SDK for Claude models
- `gemini_sdk`: Google Gen AI SDK for Gemini models

## Migration Steps

### 1. Update models.yaml

All models in `models.yaml` now require an `auth_method` field. The following table shows the migration for each model:

| Model Alias | Previous Config | New Config | Notes |
|------------|----------------|-----------|-------|
| `gemini` | No auth_method | `auth_method: "gemini_sdk"` | Uses Google Gen AI SDK |
| `claude-sonnet` | No auth_method | `auth_method: "claude_sdk"` | Uses Anthropic Vertex SDK |
| `claude-opus` | No auth_method | `auth_method: "bearer_token"` | Uses OpenAPI endpoint |
| `deepseek-v3` | No auth_method | `auth_method: "bearer_token"` | Uses OpenAPI endpoint |
| `deepseek-r1` | No auth_method | `auth_method: "bearer_token"` | Uses OpenAPI endpoint |
| `qwen-coder` | No auth_method | `auth_method: "bearer_token"` | Uses OpenAPI endpoint |
| `kimi-k2` | No auth_method | `auth_method: "bearer_token"` | Uses OpenAPI endpoint |

### 2. Environment Variables

#### For Bearer Token Models (No Changes Required)

Bearer token models use Google Application Default Credentials (ADC), which are already configured if you have `gcloud` set up:

```bash
# Verify credentials
gcloud auth application-default login
```

#### For SDK-Based Models

SDK-based models require additional setup:

**Claude SDK (`claude_sdk`):**
```bash
# Install Anthropic Vertex SDK
pip install anthropic[vertex]

# Set project ID
export GOOGLE_CLOUD_PROJECT=your-project-id
```

**Gemini SDK (`gemini_sdk`):**
```bash
# Install Google Gen AI SDK
pip install google-generativeai vertexai

# Set project ID
export GOOGLE_CLOUD_PROJECT=your-project-id
```

### 3. Code Changes

#### Before (Old API)

```typescript
// Old way - direct API calls
const response = await fetch(endpoint, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

#### After (New Adapter System)

```typescript
// New way - using adapters
const modelService = new ModelService();
const config = modelService.getModelConfig('claude-sonnet', projectId);
const adapter = modelService.getAdapter(config);
const result = await adapter.authenticate(config);
const response = await adapter.sendRequest({
  config,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### 4. Configuration Validation

The new system includes automatic configuration validation:

```typescript
const validation = modelService.validateConfig(config);
if (!validation.valid) {
  console.error(validation.error);
  console.log('Actionable steps:', validation.actionableSteps);
}
```

### 5. Error Handling

Error handling has been improved with actionable error messages:

```typescript
try {
  const result = await adapter.authenticate(config);
  if (!result.success) {
    console.error(result.error?.message);
    console.log('Actionable steps:', result.error?.actionableSteps);
  }
} catch (error) {
  if (error instanceof AuthError) {
    console.error(`Auth Error [${error.code}]:`, error.message);
    console.log('Actionable steps:', error.actionableSteps);
  }
}
```

## Breaking Changes

### 1. Required `auth_method` Field

All models must now specify an `auth_method` field. Models without this field will fail validation.

**Before:**
```yaml
claude-sonnet:
  name: "Claude Sonnet 4.5"
  endpoint_id: "claude-sonnet-4-5@20250929"
  region: "global"
```

**After:**
```yaml
claude-sonnet:
  name: "Claude Sonnet 4.5"
  endpoint_id: "claude-sonnet-4-5@20250929"
  region: "global"
  auth_method: "claude_sdk"  # Required
```

### 2. SDK Dependencies

SDK-based models require Python and specific packages. The CLI will validate these dependencies and provide clear error messages if they're missing.

### 3. Environment Variables

SDK-based models require `GOOGLE_CLOUD_PROJECT` to be set. The CLI will validate this and provide actionable error messages.

## Rollback Plan

If you need to rollback to the previous authentication system:

1. Remove `auth_method` fields from `models.yaml` (not recommended - will break validation)
2. Revert to previous version of the codebase
3. Restore previous authentication logic

**Note:** Rollback is not recommended as the new system provides better error handling, performance monitoring, and support for multiple authentication methods.

## Testing

After migration, verify that all models work correctly:

```bash
# Test bearer token models
npm test -- bearer-token-auth.test.ts

# Test Claude SDK
npm test -- claude-sdk-auth.test.ts

# Test Gemini SDK
npm test -- gemini-sdk-auth.test.ts
```

## Support

If you encounter issues during migration:

1. Check error messages - they now include actionable steps
2. Verify environment variables are set correctly
3. Ensure Python dependencies are installed for SDK-based models
4. Check that `gcloud` credentials are configured for bearer token models

## Performance

The new system includes performance monitoring:

- Bearer token authentication: Target < 5 seconds
- SDK authentication: Target < 10 seconds

Performance warnings are logged if targets are exceeded.

## Additional Resources

- [Configuration Guide](../src/vtx_cli/configs/README.md)
- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)

