# Feature Specification: Fix Model Authentication Methods

**Feature Branch**: `003-fix-model-auth`  
**Created**: January 2025  
**Status**: Draft  
**Input**: User description: "perbaiki metode autentikasi di setiap model menjadi seperti ini:"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - DeepSeek Models Authentication (Priority: P1)

Users can authenticate to DeepSeek v3.1 and DeepSeek R1 0528 models using bearer tokens via OpenAPI endpoints without authentication errors.

**Why this priority**: These models require specific OpenAPI endpoint authentication using bearer tokens, which is different from the current implementation.

**Independent Test**: Can be tested by configuring valid credentials and sending a request to DeepSeek models, expecting successful authentication and response.

**Acceptance Scenarios**:

1. **Given** a user has valid credentials configured, **When** they request to use DeepSeek v3.1 model, **Then** the system authenticates using bearer token from authentication tool and successfully connects to `us-south1-aiplatform.googleapis.com` endpoint
2. **Given** a user has valid credentials configured, **When** they request to use DeepSeek R1 0528 model, **Then** the system authenticates using bearer token and successfully connects to the OpenAPI endpoint
3. **Given** authentication succeeds, **When** a user sends a chat completion request to DeepSeek models, **Then** the request includes proper Authorization header with bearer token and receives valid model response

---

### User Story 2 - Qwen Coder Authentication (Priority: P1)

Users can authenticate to Qwen Coder model using bearer tokens via OpenAPI endpoint in the us-south1 region.

**Why this priority**: Qwen Coder requires OpenAPI endpoint authentication with specific region configuration.

**Independent Test**: Can be tested by configuring credentials and sending a request to Qwen Coder model, verifying successful authentication to the correct endpoint.

**Acceptance Scenarios**:

1. **Given** a user has valid credentials, **When** they request to use Qwen Coder model, **Then** the system authenticates using bearer token from authentication tool to `us-south1-aiplatform.googleapis.com` endpoint
2. **Given** authentication succeeds, **When** a user sends a coding-related prompt to Qwen Coder, **Then** the request is properly authenticated and the model responds with code suggestions

---

### User Story 3 - Claude Sonnet 4.5 Authentication (Priority: P1)

Users can authenticate to Claude Sonnet 4.5 model using Claude-specific SDK with proper region and project configuration that provides native Vertex AI integration.

**Why this priority**: Claude models require a specialized SDK that provides native Vertex AI integration, different from standard bearer token authentication.

**Independent Test**: Can be tested by configuring the Claude SDK client with correct project ID and region, then sending a request to verify successful authentication.

**Acceptance Scenarios**:

1. **Given** a user has the Claude SDK configured, **When** they configure the client with project ID and region="global", **Then** the client authenticates successfully using Vertex AI credentials
2. **Given** authentication succeeds, **When** a user sends a message to Claude Sonnet 4.5 model, **Then** the request uses Claude SDK authentication and receives valid response
3. **Given** a user has valid Vertex AI credentials, **When** they use the Claude SDK client, **Then** the SDK automatically handles credential discovery and token management

---

### User Story 4 - Gemini 2.5 Pro Authentication (Priority: P1)

Users can authenticate to Gemini 2.5 Pro model using Gemini-specific SDK with Vertex AI mode enabled and proper project/location configuration.

**Why this priority**: Gemini models require a specialized SDK with Vertex AI mode enabled, which provides native integration and better feature support.

**Independent Test**: Can be tested by configuring the Gemini SDK client with Vertex AI mode enabled, project, and location="global", then sending a request to verify successful authentication.

**Acceptance Scenarios**:

1. **Given** a user has the Gemini SDK configured, **When** they configure the client with Vertex AI mode enabled, project, and location="global", **Then** the client authenticates successfully using Vertex AI credentials
2. **Given** authentication succeeds, **When** a user sends a content generation request to Gemini 2.5 Pro, **Then** the request uses Gemini SDK authentication and receives valid response
3. **Given** a user has valid Vertex AI credentials, **When** they use the Gemini SDK client with Vertex AI mode enabled, **Then** the SDK automatically handles credential discovery and authentication

---

### User Story 5 - Kimi K2 Authentication (Priority: P1)

Users can authenticate to Kimi K2 model using bearer tokens via OpenAPI endpoint in the global region.

**Why this priority**: Kimi K2 requires OpenAPI endpoint authentication with global region configuration, different from us-south1 used by other models.

**Independent Test**: Can be tested by configuring credentials and sending a request to Kimi K2 model, verifying successful authentication to the global endpoint.

**Acceptance Scenarios**:

1. **Given** a user has valid credentials, **When** they request to use Kimi K2 model, **Then** the system authenticates using bearer token from authentication tool to `aiplatform.googleapis.com` endpoint with region="global"
2. **Given** authentication succeeds, **When** a user sends a request to Kimi K2, **Then** the request is properly authenticated and the model responds correctly

---

### Edge Cases

- What happens when credentials are expired or invalid for OpenAPI endpoint models?
- How does the system handle authentication when multiple authentication methods are configured simultaneously?
- What occurs when a user switches between models that require different authentication methods in the same session?
- How does the system behave when the required SDKs are not installed or configured?
- What happens when environment variables (GOOGLE_CLOUD_PROJECT) are not set for SDK-based authentication?
- How does the system handle authentication when running in environments without the required authentication tool installed?
- What occurs when a user's credentials have insufficient permissions for specific models?
- How does the system manage authentication errors when the wrong authentication method is used for a model?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST authenticate DeepSeek v3.1 model using bearer token from authentication tool to `us-south1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-south1/endpoints/openapi/chat/completions` endpoint
- **FR-002**: The system MUST authenticate DeepSeek R1 0528 model using bearer token from authentication tool to `us-south1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-south1/endpoints/openapi/chat/completions` endpoint
- **FR-003**: The system MUST authenticate Qwen Coder model using bearer token from authentication tool to `us-south1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-south1/endpoints/openapi/chat/completions` endpoint
- **FR-004**: The system MUST authenticate Kimi K2 model using bearer token from authentication tool to `aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/global/endpoints/openapi/chat/completions` endpoint
- **FR-005**: The system MUST authenticate Claude Sonnet 4.5 model using Claude-specific SDK with region="global" and project_id configuration
- **FR-006**: The system MUST authenticate Gemini 2.5 Pro model using Gemini-specific SDK with Vertex AI mode enabled, project, and location="global" configuration
- **FR-007**: The system MUST automatically detect which authentication method to use based on the model being accessed
- **FR-008**: The system MUST provide clear error messages when required authentication dependencies are missing (e.g., required SDKs, authentication tools)
- **FR-009**: The system MUST validate that required environment variables (GOOGLE_CLOUD_PROJECT) are set before attempting authentication
- **FR-010**: The system MUST handle authentication token refresh automatically for bearer token-based models
- **FR-011**: The system MUST support streaming responses for OpenAPI endpoint models (stream:true in request payload)
- **FR-012**: The system MUST use correct model identifiers in authentication requests (e.g., "deepseek-ai/deepseek-v3.1-maas", "qwen/qwen3-coder-480b-a35b-instruct-maas")
- **FR-013**: The system MUST use correct region configuration for each model (us-south1 for DeepSeek/Qwen, global for Claude/Gemini/Kimi)
- **FR-014**: The system MUST ensure Claude SDK automatically handles credential discovery from environment
- **FR-015**: The system MUST ensure Gemini SDK automatically handles credential discovery when Vertex AI mode is enabled

### Key Entities _(include if feature involves data)_

- **Model Configuration**: Defines which authentication method to use for each model (OpenAPI bearer token, Claude SDK, Gemini SDK)
- **Authentication Method**: The type of authentication required (bearer token via authentication tool, Claude SDK, Gemini SDK)
- **Access Token**: Bearer token obtained from authentication tool for OpenAPI endpoint models
- **SDK Client**: Client instances configured with proper credentials and project settings for SDK-based authentication
- **Endpoint URL**: The specific API endpoint URL for each model including region and project ID
- **Model Identifier**: The exact model name/ID used in API requests (e.g., "deepseek-ai/deepseek-v3.1-maas", "claude-sonnet-4-5@20250929")
- **Region Configuration**: The GCP region for each model (us-south1, global)
- **Project Configuration**: Google Cloud project ID required for all authentication methods

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can successfully authenticate and access DeepSeek v3.1, DeepSeek R1, Qwen Coder, and Kimi K2 models using bearer token authentication within 5 seconds of request initiation
- **SC-002**: Users can successfully authenticate and access Claude Sonnet 4.5 model using Claude SDK within 10 seconds of request initiation
- **SC-003**: Users can successfully authenticate and access Gemini 2.5 Pro model using Gemini SDK within 10 seconds of request initiation
- **SC-004**: 100% of configured models use the correct authentication method as specified in the requirements
- **SC-005**: Authentication errors are detected and reported within 5 seconds, with clear messages indicating which dependency or configuration is missing
- **SC-006**: Users can switch between models with different authentication methods in the same session without manual re-authentication
- **SC-007**: Streaming responses work correctly for OpenAPI endpoint models (DeepSeek, Qwen, Kimi) when stream:true is specified
- **SC-008**: All authentication methods automatically handle credential refresh without user intervention, maintaining 99% success rate for authenticated requests

## Assumptions

- Users have authentication tool installed and configured for OpenAPI endpoint models (DeepSeek, Qwen, Kimi)
- Users have Claude SDK installed and configured for Claude Sonnet 4.5 model
- Users have Gemini SDK installed and configured for Gemini 2.5 Pro model
- Users have valid Google Cloud credentials configured (via authentication tool or environment variables)
- Users have GOOGLE_CLOUD_PROJECT environment variable set or can provide project ID
- The Vertex AI API is enabled in the user's Google Cloud project
- Users have necessary IAM permissions to access the models in their project
- Network connectivity to Google Cloud APIs is available
- Model endpoints and identifiers remain stable and match the specifications provided

## Dependencies

- Authentication tool installed and configured for bearer token authentication
- Claude SDK installed and configured for Claude authentication
- Gemini SDK installed and configured for Gemini authentication
- Valid Google Cloud credentials (ADC, service account, or API key)
- Google Cloud project with Vertex AI API enabled
- Network access to Google Cloud endpoints
- Proper IAM roles assigned for model access
- GOOGLE_CLOUD_PROJECT environment variable or project ID configuration

## Out of Scope

- Installing or configuring authentication tools
- Installing or configuring SDKs
- Creating or managing Google Cloud projects
- Setting up IAM roles and permissions
- Modifying model capabilities or availability
- Implementing custom authentication protocols beyond the specified methods
- Handling authentication for models not listed in the requirements
- Managing billing or quota settings
- Providing fallback authentication methods not specified
- Supporting authentication methods other than those explicitly required for each model

