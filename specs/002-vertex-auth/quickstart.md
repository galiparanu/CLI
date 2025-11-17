# Quickstart: Vertex AI Authentication

**Feature**: Vertex AI Authentication Improvement  
**Audience**: Developers implementing authentication changes  
**Date**: November 16, 2025

## Overview

This quickstart guide helps developers understand and implement the improved Vertex AI authentication system supporting multiple authentication methods with automatic detection.

## Prerequisites

- Node.js >= 20.0.0
- TypeScript knowledge
- Understanding of Google Cloud authentication concepts
- Access to the gemini-cli codebase

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Environment                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ GOOGLE_API_  │  │  GOOGLE_     │  │ gcloud ADC       │  │
│  │ KEY          │  │  APPLICATION │  │ (~/.config/      │  │
│  │              │  │  _CREDENTIALS│  │ gcloud/)         │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼──────────────────┼───────────────────┼────────────┘
          │                  │                   │
          ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                Authentication Detection                      │
│  Priority: API Key > Service Account > ADC > Compute        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                Credential Provider Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ API Key      │  │ Service      │  │ ADC Provider     │  │
│  │ Provider     │  │ Account      │  │ (GoogleAuth)     │  │
│  │              │  │ Provider     │  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼──────────────────┼───────────────────┼────────────┘
          │                  │                   │
          └──────────────────┼───────────────────┘
                             ▼
                    ┌────────────────┐
                    │ Token Cache    │
                    │ (5-min buffer) │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Access Token   │
                    │ Bearer: xxx... │
                    └────────┬───────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               Vertex AI API Requests                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Gemini   │  │ Claude   │  │ Qwen     │  │ DeepSeek │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Authentication Detection

**Location**: `src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts`

**Function**: `getAuthTypeFromEnv()`

**Purpose**: Detect which authentication method to use based on environment

**Implementation**:

```typescript
function getAuthTypeFromEnv(): AuthType | undefined {
  // Priority 1: Explicit Vertex AI with API key
  if (process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true") {
    return AuthType.USE_VERTEX_AI;
  }

  // Priority 2: GCA mode (Google Cloud Auth)
  if (process.env["GOOGLE_GENAI_USE_GCA"] === "true") {
    return AuthType.LOGIN_WITH_GOOGLE;
  }

  // Priority 3: Gemini API key
  if (process.env["GEMINI_API_KEY"]) {
    return AuthType.USE_GEMINI;
  }

  return undefined;
}
```

### 2. Credential Providers

#### GoogleCredentialProvider (ADC)

**Location**: `src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts`

**Purpose**: Provide authentication using Application Default Credentials

**Key Methods**:

- `tokens()`: Get access token with caching
- `saveTokens()`: No-op (ADC manages tokens)

**Usage Example**:

```typescript
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const client = await auth.getClient();
const accessToken = await client.getAccessToken();
// { token: 'ya29.xxx', res: {...} }
```

#### API Key Provider

**Location**: `src/vtx_cli/packages/core/src/core/apiKeyCredentialStorage.ts`

**Purpose**: Securely store and retrieve Google Cloud API keys

**Key Methods**:

- `loadApiKey()`: Load cached API key
- `saveApiKey()`: Save API key to secure storage
- `clearApiKey()`: Remove cached API key

**Usage Example**:

```typescript
import { saveApiKey, loadApiKey } from "./apiKeyCredentialStorage";

// Save API key
await saveApiKey(process.env["GOOGLE_API_KEY"]);

// Load API key
const apiKey = await loadApiKey();
// Returns stored key or null
```

### 3. Token Caching

**Location**: `src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts` (example)

**Pattern**:

```typescript
const FIVE_MIN_BUFFER_MS = 5 * 60 * 1000;

async tokens(): Promise<OAuthTokens | undefined> {
  // Check if cached token is still valid
  if (
    this.cachedToken &&
    this.tokenExpiryTime &&
    Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
  ) {
    return this.cachedToken; // Return cached
  }

  // Fetch new token
  const client = await this.auth.getClient();
  const accessTokenResponse = await client.getAccessToken();

  if (!accessTokenResponse.token) {
    throw new Error('Failed to get access token');
  }

  // Cache new token
  this.cachedToken = {
    access_token: accessTokenResponse.token,
    token_type: 'Bearer',
  };

  this.tokenExpiryTime = client.credentials?.expiry_date;

  return this.cachedToken;
}
```

### 4. Configuration Validation

**Location**: `src/vtx_cli/packages/cli/src/config/auth.ts`

**Function**: `validateAuthMethod(authMethod: string)`

**Purpose**: Validate required environment variables are set

**Current Implementation**:

```typescript
export function validateAuthMethod(authMethod: string): string | null {
  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env["GOOGLE_CLOUD_PROJECT"] &&
      !!process.env["GOOGLE_CLOUD_LOCATION"];
    const hasGoogleApiKey = !!process.env["GOOGLE_API_KEY"];

    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        "When using Vertex AI, you must specify either:\n" +
        "• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n" +
        "• GOOGLE_API_KEY environment variable (if using express mode).\n" +
        "Update your environment and try again (no reload needed if using .env)!"
      );
    }
  }

  return null; // Valid
}
```

## Implementation Steps

### Step 1: Enhance Authentication Detection

**File**: `src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts`

**Changes**:

1. Add detection for `GOOGLE_APPLICATION_CREDENTIALS`
2. Add detection for ADC file existence
3. Implement priority-based selection
4. Add debug logging for detected method

**Example Enhancement**:

```typescript
function detectCredentialSource(): CredentialSource | null {
  // Check API Key
  if (process.env["GOOGLE_API_KEY"]) {
    debugLogger.debug("Detected credential source: API_KEY");
    return CredentialSource.API_KEY;
  }

  // Check Service Account file
  const saPath = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
  if (saPath && fs.existsSync(saPath)) {
    debugLogger.debug("Detected credential source: SERVICE_ACCOUNT_FILE");
    return CredentialSource.SERVICE_ACCOUNT_FILE;
  }

  // Check ADC
  const adcPath = path.join(
    os.homedir(),
    ".config",
    "gcloud",
    "application_default_credentials.json"
  );
  if (fs.existsSync(adcPath)) {
    debugLogger.debug("Detected credential source: ADC_GCLOUD");
    return CredentialSource.ADC_GCLOUD;
  }

  // Check Compute metadata (GCE/GKE)
  // Note: Don't make network call here, just check environment
  if (
    process.env["GCE_METADATA_HOST"] ||
    process.env["KUBERNETES_SERVICE_HOST"]
  ) {
    debugLogger.debug("Detected credential source: COMPUTE_METADATA");
    return CredentialSource.COMPUTE_METADATA;
  }

  return null;
}
```

### Step 2: Improve Validation Logic

**File**: `src/vtx_cli/packages/cli/src/config/auth.ts`

**Changes**:

1. Add validation for service account JSON file
2. Add validation for GCP project ID format
3. Add validation for region format
4. Enhance error messages with specific remediation

**Example Enhancement**:

```typescript
function validateServiceAccountFile(path: string): ValidationError | null {
  // Check file exists
  if (!fs.existsSync(path)) {
    return {
      field: "GOOGLE_APPLICATION_CREDENTIALS",
      message: `Service account file not found: ${path}`,
      remediationSteps: [
        "Verify the file path is correct",
        "Ensure the file has not been moved or deleted",
        "Use an absolute path to avoid relative path issues",
        "Download a new service account key from Google Cloud Console",
      ],
    };
  }

  // Check file is readable
  try {
    fs.accessSync(path, fs.constants.R_OK);
  } catch (error) {
    return {
      field: "GOOGLE_APPLICATION_CREDENTIALS",
      message: `Service account file is not readable: ${path}`,
      remediationSteps: [
        "Check file permissions (should be at least 400)",
        `Run: chmod 600 ${path}`,
        "Ensure you have read access to the file",
      ],
    };
  }

  // Check JSON is valid
  try {
    const content = fs.readFileSync(path, "utf-8");
    const json = JSON.parse(content);

    if (json.type !== "service_account") {
      return {
        field: "GOOGLE_APPLICATION_CREDENTIALS",
        message: "File is not a valid service account JSON",
        remediationSteps: [
          "Verify you downloaded a service account key (not OAuth client)",
          'File should contain "type": "service_account"',
          "Download a new service account key from IAM & Admin > Service Accounts",
        ],
      };
    }
  } catch (error) {
    return {
      field: "GOOGLE_APPLICATION_CREDENTIALS",
      message: "Service account JSON is malformed",
      remediationSteps: [
        "Verify file is valid JSON",
        "Check file is not corrupted",
        "Download a fresh service account key",
      ],
    };
  }

  return null; // Valid
}
```

### Step 3: Implement Token Refresh Logic

**File**: `src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts`

**Changes**:

1. Ensure 5-minute buffer is applied consistently
2. Add retry logic for transient failures
3. Add metrics/logging for refresh operations

**Already Implemented**: The existing `GoogleCredentialProvider` already has good token caching. Ensure this pattern is replicated for other auth methods.

### Step 4: Enhance Error Messages

**File**: Multiple locations where authentication errors occur

**Pattern**:

```typescript
class AuthenticationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly remediationSteps: string[],
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "AuthenticationError";
  }

  toString(): string {
    let msg = `${this.name}: ${this.message}\n`;
    if (this.remediationSteps.length > 0) {
      msg += "\nTo fix this issue:\n";
      this.remediationSteps.forEach((step, i) => {
        msg += `  ${i + 1}. ${step}\n`;
      });
    }
    return msg;
  }
}

// Usage
throw new AuthenticationError(
  "MISSING_ENV",
  "Required environment variables not set",
  [
    "Set GOOGLE_CLOUD_PROJECT to your GCP project ID",
    "Set GOOGLE_CLOUD_LOCATION to your preferred region (e.g., us-central1)",
    "Or set GOOGLE_API_KEY for express mode",
    "Update your .env file or run: export GOOGLE_CLOUD_PROJECT=your-project",
  ]
);
```

### Step 5: Add Integration Tests

**File**: New directory `src/vtx_cli/integration-tests/authentication/`

**Test Cases**:

```typescript
// adc-auth.test.ts
describe("ADC Authentication", () => {
  it("should authenticate with gcloud ADC", async () => {
    // Assume ADC is configured
    const provider = new GoogleCredentialProvider();
    const token = await provider.tokens();

    expect(token).toBeDefined();
    expect(token?.access_token).toMatch(/^ya29\./);
  });

  it("should cache token for repeated calls", async () => {
    const provider = new GoogleCredentialProvider();
    const token1 = await provider.tokens();
    const token2 = await provider.tokens();

    expect(token1).toBe(token2); // Same object
  });
});

// service-account-auth.test.ts
describe("Service Account Authentication", () => {
  it("should authenticate with service account JSON", async () => {
    process.env["GOOGLE_APPLICATION_CREDENTIALS"] = "/path/to/sa.json";

    const auth = new GoogleAuth({ scopes: OAUTH_SCOPE });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    expect(token.token).toBeDefined();
  });

  it("should fail with clear error if file not found", async () => {
    process.env["GOOGLE_APPLICATION_CREDENTIALS"] = "/nonexistent/sa.json";

    await expect(async () => {
      const auth = new GoogleAuth({ scopes: OAUTH_SCOPE });
      await auth.getClient();
    }).rejects.toThrow("not found");
  });
});

// api-key-auth.test.ts
describe("API Key Authentication", () => {
  it("should use API key for Vertex AI", async () => {
    process.env["GOOGLE_API_KEY"] = "test-api-key-123";
    process.env["GOOGLE_GENAI_USE_VERTEXAI"] = "true";

    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI
    );

    expect(config.apiKey).toBe("test-api-key-123");
    expect(config.vertexai).toBe(true);
  });
});
```

## Testing Locally

### 1. Test with API Key

```bash
# Set environment variables
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI="true"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"

# Run CLI
npm run start
```

### 2. Test with Service Account

```bash
# Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"

# Run CLI
npm run start
```

### 3. Test with ADC

```bash
# Configure ADC with gcloud
gcloud auth application-default login

# Set environment variables
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"

# Run CLI
npm run start
```

### 4. Verify Token Caching

```bash
# Enable debug logging
export DEBUG=1

# Run CLI and watch for token acquisition messages
npm run start

# Should see:
# "Created Google ADC client"
# "Access token cached, expires in XX minutes"
# On second request: "Using cached access token"
```

## Common Issues and Solutions

### Issue: "API keys are not supported by this API"

**Cause**: Organization policy restricts API key usage

**Solution**:

```bash
# Use service account instead
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"
unset GOOGLE_API_KEY
```

### Issue: "Permission denied"

**Cause**: Service account lacks necessary IAM role

**Solution**:

```bash
# Grant Vertex AI User role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:your-sa@your-project.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### Issue: "Vertex AI API has not been used in project"

**Cause**: Vertex AI API not enabled

**Solution**:

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
```

### Issue: Token refresh fails silently

**Cause**: Token expiry not being tracked correctly

**Debug**:

```typescript
// Add logging to token refresh
debugLogger.debug(`Token expires at: ${new Date(expiryTime)}`);
debugLogger.debug(`Current time: ${new Date()}`);
debugLogger.debug(`Time until expiry: ${expiryTime - Date.now()}ms`);
```

## Best Practices

1. **Always use environment variables** for configuration (never hardcode credentials)
2. **Use .env files** for local development (add to .gitignore)
3. **Prefer ADC in development**, service accounts in production
4. **Set up proper IAM roles** before testing
5. **Enable debug logging** when troubleshooting
6. **Clear credentials** when switching authentication methods
7. **Monitor token refresh** in long-running sessions
8. **Test all auth methods** in your CI/CD pipeline

## Next Steps

After implementing authentication improvements:

1. Run full test suite: `npm run test`
2. Run integration tests: `npm run test:integration:all`
3. Test with each authentication method manually
4. Update documentation with new environment variables
5. Create migration guide for existing users
6. Update error handling across codebase

## References

- [Google Auth Library Documentation](https://github.com/googleapis/google-auth-library-nodejs)
- [Vertex AI Authentication Guide](https://cloud.google.com/vertex-ai/docs/authentication)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Service Account Keys](https://cloud.google.com/iam/docs/keys-create-delete)
