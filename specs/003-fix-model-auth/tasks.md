# Implementation Tasks: Fix Model Authentication Methods

**Feature**: Fix Model Authentication Methods  
**Branch**: `003-fix-model-auth`  
**Date**: January 2025  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Summary

This document breaks down the implementation into atomic, testable tasks organized by user story priority. Each task is independently executable and includes specific file paths.

**Total Tasks**: 45  
**User Stories**: 5 (all P1)  
**MVP Scope**: User Story 1 (DeepSeek Models) - 15 tasks

## Implementation Strategy

**MVP First**: Start with User Story 1 (DeepSeek Models) to establish the bearer token authentication pattern, then extend to other models.

**Incremental Delivery**: 
1. Phase 1-2: Foundation (blocking prerequisites)
2. Phase 3: US1 - DeepSeek Models (MVP)
3. Phase 4: US2 - Qwen Coder (reuses US1 adapter)
4. Phase 5: US3 - Claude Sonnet 4.5 (new SDK adapter)
5. Phase 6: US4 - Gemini 2.5 Pro (new SDK adapter)
6. Phase 7: US5 - Kimi K2 (reuses US1 adapter)
7. Phase 8: Polish & cross-cutting concerns

## Dependencies

### Story Completion Order

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational) → All user stories depend on this
  ↓
Phase 3 (US1: DeepSeek) → Establishes bearer token pattern
  ↓
Phase 4 (US2: Qwen) → Reuses US1 adapter
  ↓
Phase 5 (US3: Claude) → Independent SDK implementation
  ↓
Phase 6 (US4: Gemini) → Independent SDK implementation
  ↓
Phase 7 (US5: Kimi) → Reuses US1 adapter
  ↓
Phase 8 (Polish)
```

### Parallel Opportunities

- **Phase 2**: All foundational types can be created in parallel (T002-T007)
- **Phase 3**: Token cache and adapter can be developed in parallel (T010, T011)
- **Phase 5 & 6**: Claude and Gemini SDK adapters are independent and can be developed in parallel
- **Phase 4 & 7**: Qwen and Kimi config updates are independent

## Phase 1: Setup

**Goal**: Initialize project structure and update configuration files.

**Independent Test**: Project structure exists, models.yaml has auth_method fields.

- [x] T001 Create directory structure for adapters in `src/vtx_cli/packages/cli/src/adapters/`
- [x] T002 Create directory structure for auth types in `src/vtx_cli/packages/core/src/auth/`
- [x] T003 Create directory structure for tests in `tests/unit/model-auth/`
- [x] T004 Create directory structure for integration tests in `src/vtx_cli/integration-tests/model-auth/`
- [x] T005 Update `src/vtx_cli/configs/models.yaml` to add `auth_method: "claude_sdk"` for claude-sonnet model
- [x] T006 Update `src/vtx_cli/configs/models.yaml` to add `auth_method: "gemini_sdk"` for gemini model
- [x] T007 Verify existing `auth_method: "bearer_token"` entries in `src/vtx_cli/configs/models.yaml` for deepseek-v3, deepseek-r1, qwen-coder, and kimi-k2

## Phase 2: Foundational

**Goal**: Create core types, interfaces, and base classes that all user stories depend on.

**Independent Test**: All types compile, interfaces are properly defined, no circular dependencies.

- [x] T008 [P] Create `AuthMethodType` enum in `src/vtx_cli/packages/core/src/auth/AuthMethodType.ts` with BEARER_TOKEN, CLAUDE_SDK, GEMINI_SDK values
- [x] T009 [P] Create `ModelAuthAdapter` interface in `src/vtx_cli/packages/core/src/auth/ModelAuthAdapter.ts` with authenticate, sendRequest, supportsStreaming, getAuthMethod, validateDependencies methods
- [x] T010 [P] Create `AuthResult` type in `src/vtx_cli/packages/core/src/auth/AuthResult.ts` with success, token, expiresAt, error, method fields
- [x] T011 [P] Create `AuthError` class in `src/vtx_cli/packages/core/src/auth/AuthError.ts` with code, message, actionableSteps, missingDependency fields and error codes enum
- [x] T012 [P] Create `CachedToken` class in `src/vtx_cli/packages/core/src/auth/CachedToken.ts` with token, expiresAt, tokenType, refreshBuffer fields and validation methods
- [x] T013 [P] Create `ModelAuthConfig` type in `src/vtx_cli/packages/core/src/services/modelService.ts` extending existing ModelConfig with authMethod field
- [x] T014 [P] Create `BearerTokenAuth` type in `src/vtx_cli/packages/core/src/auth/BearerTokenAuth.ts` with token, expiresAt, region, endpoint, projectId fields
- [x] T015 [P] Create `SDKAuthConfig` type in `src/vtx_cli/packages/core/src/auth/SDKAuthConfig.ts` with sdkType, region, projectId, modelId, pythonPath fields
- [x] T016 Update `ModelService` class in `src/vtx_cli/packages/core/src/services/modelService.ts` to add `getModelConfig()` method that loads and parses auth_method from models.yaml
- [x] T017 Update `ModelService` class in `src/vtx_cli/packages/core/src/services/modelService.ts` to add `getAdapter()` method that returns appropriate adapter based on authMethod
- [x] T018 Update `ModelService` class in `src/vtx_cli/packages/core/src/services/modelService.ts` to add `validateConfig()` method that validates ModelAuthConfig

## Phase 3: User Story 1 - DeepSeek Models Authentication

**Goal**: Users can authenticate to DeepSeek v3.1 and DeepSeek R1 0528 models using bearer tokens via OpenAPI endpoints.

**Independent Test**: Configure valid credentials, send request to DeepSeek models, expect successful authentication and response within 5 seconds.

- [x] T019 [US1] Create `OpenAPIAdapter` class in `src/vtx_cli/packages/core/src/auth/adapters/openapi-adapter.ts` implementing ModelAuthAdapter interface (moved to core for proper architecture)
- [x] T020 [US1] Implement `authenticate()` method in `OpenAPIAdapter` class using GoogleAuth to obtain bearer token
- [x] T021 [US1] Implement token caching logic in `OpenAPIAdapter` class with 5-minute refresh buffer
- [x] T022 [US1] Implement `buildEndpoint()` private method in `OpenAPIAdapter` class to construct OpenAPI endpoint URLs
- [x] T023 [US1] Implement `sendRequest()` method in `OpenAPIAdapter` class with Authorization header and OpenAPI request format
- [x] T024 [US1] Implement `supportsStreaming()` method in `OpenAPIAdapter` class returning true
- [x] T025 [US1] Implement `getAuthMethod()` method in `OpenAPIAdapter` class returning BEARER_TOKEN
- [x] T026 [US1] Implement `validateDependencies()` method in `OpenAPIAdapter` class checking for GoogleAuth availability
- [x] T027 [US1] Implement token refresh logic in `OpenAPIAdapter` class that refreshes tokens 5 minutes before expiry
- [x] T028 [US1] Implement error handling in `OpenAPIAdapter` class mapping errors to AuthError codes
- [x] T029 [US1] Update `ModelService.getAdapter()` in `src/vtx_cli/packages/core/src/services/modelService.ts` to return OpenAPIAdapter instance for BEARER_TOKEN authMethod
- [x] T030 [US1] Integrate OpenAPIAdapter with `vertexAiContentGenerator.ts` in `src/vtx_cli/packages/core/src/core/vertexAiContentGenerator.ts` to use adapter for DeepSeek models
- [x] T031 [US1] Create unit test file `src/vtx_cli/packages/core/src/auth/adapters/openapi-adapter.test.ts` with tests for authenticate, sendRequest, token caching, and error handling
- [x] T032 [US1] Create integration test file `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts` testing DeepSeek v3.1 and DeepSeek R1 authentication

## Phase 4: User Story 2 - Qwen Coder Authentication

**Goal**: Users can authenticate to Qwen Coder model using bearer tokens via OpenAPI endpoint in the us-south1 region.

**Independent Test**: Configure credentials, send request to Qwen Coder model, verify successful authentication to us-south1-aiplatform.googleapis.com endpoint.

- [x] T033 [US2] Verify Qwen Coder model configuration in `src/vtx_cli/configs/models.yaml` has `auth_method: "bearer_token"` and correct region/endpoint
- [x] T034 [US2] Test Qwen Coder authentication using existing OpenAPIAdapter in `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts` adding Qwen Coder test case
- [x] T035 [US2] Update integration test assertions in `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts` to verify us-south1 region endpoint for Qwen Coder

## Phase 5: User Story 3 - Claude Sonnet 4.5 Authentication

**Goal**: Users can authenticate to Claude Sonnet 4.5 model using Claude-specific SDK with proper region and project configuration.

**Independent Test**: Configure Claude SDK client with project ID and region="global", send request, verify successful authentication within 10 seconds.

- [x] T036 [US3] Create `ClaudeSDKAdapter` class in `src/vtx_cli/packages/core/src/auth/adapters/claude-sdk-adapter.ts` implementing ModelAuthAdapter interface (moved to core for proper architecture)
- [x] T037 [US3] Implement `validateDependencies()` method in `ClaudeSDKAdapter` class checking for Python and anthropic package
- [x] T038 [US3] Implement `authenticate()` method in `ClaudeSDKAdapter` class validating dependencies and returning success
- [x] T039 [US3] Create Python script template generator method in `ClaudeSDKAdapter` class for AnthropicVertex client initialization
- [x] T040 [US3] Implement `sendRequest()` method in `ClaudeSDKAdapter` class executing Python script via child process
- [x] T041 [US3] Implement `supportsStreaming()` method in `ClaudeSDKAdapter` class returning true
- [x] T042 [US3] Implement `getAuthMethod()` method in `ClaudeSDKAdapter` class returning CLAUDE_SDK
- [x] T043 [US3] Implement error handling in `ClaudeSDKAdapter` class mapping Python errors to AuthError codes
- [x] T044 [US3] Update `ModelService.getAdapter()` in `src/vtx_cli/packages/core/src/services/modelService.ts` to return ClaudeSDKAdapter instance for CLAUDE_SDK authMethod
- [x] T045 [US3] Integrate ClaudeSDKAdapter with `vertexAiContentGenerator.ts` in `src/vtx_cli/packages/core/src/core/vertexAiContentGenerator.ts` to use adapter for Claude Sonnet model
- [x] T046 [US3] Create unit test file `src/vtx_cli/packages/core/src/auth/adapters/claude-sdk-adapter.test.ts` with tests for dependency validation, authenticate, sendRequest, and error handling
- [x] T047 [US3] Create integration test file `src/vtx_cli/integration-tests/model-auth/claude-sdk-auth.test.ts` testing Claude Sonnet 4.5 authentication

## Phase 6: User Story 4 - Gemini 2.5 Pro Authentication

**Goal**: Users can authenticate to Gemini 2.5 Pro model using Gemini-specific SDK with Vertex AI mode enabled and proper project/location configuration.

**Independent Test**: Configure Gemini SDK client with Vertex AI mode enabled, project, and location="global", send request, verify successful authentication within 10 seconds.

- [x] T048 [US4] Create `GeminiSDKAdapter` class in `src/vtx_cli/packages/core/src/auth/adapters/gemini-sdk-adapter.ts` implementing ModelAuthAdapter interface (moved to core for proper architecture)
- [x] T049 [US4] Implement `validateDependencies()` method in `GeminiSDKAdapter` class checking for Python and google.genai package
- [x] T050 [US4] Implement `authenticate()` method in `GeminiSDKAdapter` class validating dependencies and returning success
- [x] T051 [US4] Create Python script template generator method in `GeminiSDKAdapter` class for genai.Client with vertexai=True
- [x] T052 [US4] Implement `sendRequest()` method in `GeminiSDKAdapter` class executing Python script via child process
- [x] T053 [US4] Implement `supportsStreaming()` method in `GeminiSDKAdapter` class returning true
- [x] T054 [US4] Implement `getAuthMethod()` method in `GeminiSDKAdapter` class returning GEMINI_SDK
- [x] T055 [US4] Implement error handling in `GeminiSDKAdapter` class mapping Python errors to AuthError codes
- [x] T056 [US4] Update `ModelService.getAdapter()` in `src/vtx_cli/packages/core/src/services/modelService.ts` to return GeminiSDKAdapter instance for GEMINI_SDK authMethod
- [x] T057 [US4] Integrate GeminiSDKAdapter with `vertexAiContentGenerator.ts` in `src/vtx_cli/packages/core/src/core/vertexAiContentGenerator.ts` to use adapter for Gemini model
- [x] T058 [US4] Create unit test file `src/vtx_cli/packages/core/src/auth/adapters/gemini-sdk-adapter.test.ts` with tests for dependency validation, authenticate, sendRequest, and error handling
- [x] T059 [US4] Create integration test file `src/vtx_cli/integration-tests/model-auth/gemini-sdk-auth.test.ts` testing Gemini 2.5 Pro authentication

## Phase 7: User Story 5 - Kimi K2 Authentication

**Goal**: Users can authenticate to Kimi K2 model using bearer tokens via OpenAPI endpoint in the global region.

**Independent Test**: Configure credentials, send request to Kimi K2 model, verify successful authentication to aiplatform.googleapis.com endpoint with region="global".

- [x] T060 [US5] Verify Kimi K2 model configuration in `src/vtx_cli/configs/models.yaml` has `auth_method: "bearer_token"` and correct global region/endpoint
- [x] T061 [US5] Test Kimi K2 authentication using existing OpenAPIAdapter in `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts` adding Kimi K2 test case
- [x] T062 [US5] Update integration test assertions in `src/vtx_cli/integration-tests/model-auth/bearer-token-auth.test.ts` to verify global region endpoint for Kimi K2

## Phase 8: Polish & Cross-Cutting Concerns

**Goal**: Complete error handling, documentation, and cross-cutting improvements.

**Independent Test**: All error scenarios handled gracefully, documentation complete, performance targets met.

- [x] T063 Implement comprehensive error messages in all adapters with actionable steps for missing dependencies
- [x] T064 Add environment variable validation in `ModelService.validateConfig()` in `src/vtx_cli/packages/core/src/services/modelService.ts` checking for GOOGLE_CLOUD_PROJECT
- [x] T065 Implement automatic token refresh for bearer token models in `OpenAPIAdapter` class in `src/vtx_cli/packages/core/src/auth/adapters/openapi-adapter.ts` handling expired tokens (already implemented)
- [x] T066 Add streaming response support in `OpenAPIAdapter.sendRequest()` in `src/vtx_cli/packages/core/src/auth/adapters/openapi-adapter.ts` processing SSE/chunked responses
- [x] T067 Update error handling to provide clear messages for missing SDK dependencies in `ClaudeSDKAdapter` and `GeminiSDKAdapter` classes
- [x] T068 Add logging for authentication method detection and adapter selection in `ModelService.getAdapter()` in `src/vtx_cli/packages/core/src/services/modelService.ts`
- [x] T069 Update documentation in `src/vtx_cli/configs/README.md` explaining new auth_method field and supported values
- [x] T070 Create migration guide in `specs/003-fix-model-auth/MIGRATION.md` for updating existing model configurations
- [x] T071 Add performance monitoring for authentication timing in all adapters to ensure < 5s (bearer) and < 10s (SDK) targets
- [x] T072 Verify all models use correct model identifiers per FR-012 in adapter implementations
- [x] T073 Verify all models use correct region configuration per FR-013 in adapter implementations
- [x] T074 Add integration test for switching between models with different authentication methods in same session
- [x] T075 Add unit tests for error scenarios: missing credentials, invalid credentials, missing dependencies, missing env vars

## Task Summary

### By Phase

- **Phase 1 (Setup)**: 7 tasks
- **Phase 2 (Foundational)**: 11 tasks
- **Phase 3 (US1: DeepSeek)**: 14 tasks
- **Phase 4 (US2: Qwen)**: 3 tasks
- **Phase 5 (US3: Claude)**: 12 tasks
- **Phase 6 (US4: Gemini)**: 12 tasks
- **Phase 7 (US5: Kimi)**: 3 tasks
- **Phase 8 (Polish)**: 13 tasks

**Total**: 75 tasks

### By User Story

- **US1 (DeepSeek)**: 14 tasks
- **US2 (Qwen)**: 3 tasks
- **US3 (Claude)**: 12 tasks
- **US4 (Gemini)**: 12 tasks
- **US5 (Kimi)**: 3 tasks

### Parallel Execution Examples

**Phase 2 (Foundational)** - Can run in parallel:
```bash
# Terminal 1
T008: Create AuthMethodType enum

# Terminal 2
T009: Create ModelAuthAdapter interface

# Terminal 3
T010: Create AuthResult type

# Terminal 4
T011: Create AuthError class

# Terminal 5
T012: Create CachedToken class

# Terminal 6
T013: Create ModelAuthConfig type
```

**Phase 5 & 6 (SDK Adapters)** - Can run in parallel:
```bash
# Terminal 1 (Claude SDK)
T036-T047: Implement ClaudeSDKAdapter

# Terminal 2 (Gemini SDK)
T048-T059: Implement GeminiSDKAdapter
```

**Phase 4 & 7 (Config Updates)** - Can run in parallel:
```bash
# Terminal 1 (Qwen)
T033-T035: Update Qwen config and tests

# Terminal 2 (Kimi)
T060-T062: Update Kimi config and tests
```

## MVP Scope Recommendation

**Start with**: Phase 1, Phase 2, and Phase 3 (User Story 1: DeepSeek Models)

**Rationale**: 
- Establishes the bearer token authentication pattern
- Can be immediately tested and validated
- Provides foundation for US2 and US5 which reuse the same adapter
- Total: 32 tasks for MVP

**After MVP**: Proceed with US2, US5 (quick wins reusing adapter), then US3, US4 (new SDK adapters)

