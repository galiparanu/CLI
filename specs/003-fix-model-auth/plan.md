# Implementation Plan: Fix Model Authentication Methods

**Branch**: `003-fix-model-auth` | **Date**: January 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-fix-model-auth/spec.md`

## Summary

Fix authentication methods for each model to use the correct authentication approach: bearer tokens via OpenAPI endpoints for DeepSeek, Qwen, and Kimi models; Claude SDK for Claude Sonnet 4.5; and Gemini SDK with Vertex AI mode for Gemini 2.5 Pro. This ensures each model uses its optimal authentication method as specified in the requirements.

## Technical Context

**Language/Version**: TypeScript (target ES2022), Node.js >= 20.0.0, Python 3.8+ (for SDK-based models)
**Primary Dependencies**:

- `google-auth-library@^9.11.0` (bearer token authentication)
- `@google-cloud/vertexai@^1.10.0` (Vertex AI SDK for Node.js)
- `@google/genai@1.16.0` (Gemini API SDK)
- `anthropic[vertex]` (Python package for Claude Vertex AI)
- `google-genai` (Python package for Gemini Vertex AI)

**Storage**: Hybrid credential storage (keychain/filesystem) via HybridTokenStorage
**Testing**: Vitest (unit and integration tests), MSW for API mocking
**Target Platform**: Cross-platform CLI (Linux, macOS, Windows), containerized environments (Docker/Podman), CI/CD systems
**Project Type**: Single monorepo workspace with packages (`@google/gemini-cli-core`, `@google/gemini-cli`)
**Performance Goals**:

- Bearer token authentication completion < 5 seconds
- SDK initialization < 10 seconds
- Support 1000+ consecutive requests without credential errors
- Automatic token refresh without user intervention

**Constraints**:

- Must use model-specific authentication methods as specified
- Must maintain backward compatibility with existing authentication flows
- Must work in both interactive and non-interactive environments
- Must securely store credentials
- Python SDKs must be callable from Node.js/TypeScript environment

**Scale/Scope**:

- 6 models requiring different authentication methods:
  - 4 models using bearer tokens (DeepSeek v3.1, DeepSeek R1, Qwen Coder, Kimi K2)
  - 1 model using Claude SDK (Claude Sonnet 4.5)
  - 1 model using Gemini SDK (Gemini 2.5 Pro)
- Multiple regions (us-south1, global)
- Existing codebase: ~500+ files in `src/vtx_cli`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I: Optimize Vertex AI Credits**: ✅ PASS - Solution uses native Vertex AI authentication mechanisms (bearer tokens, SDKs) exclusively for accessing Vertex AI models. All authentication methods are official Google Cloud/Anthropic SDKs.

- **Principle II: Extensibility & Flexibility**: ✅ PASS - Authentication system maintains modular architecture allowing model-specific authentication methods. Uses adapter pattern for different authentication types per model.

- **Principle III: Personalization (Statefulness)**: ✅ PASS - Credential caching and session management preserve user state across sessions. Supports persistent authentication without repeated logins for all authentication methods.

- **Principle IV: Guardrails**:

  - ✅ PASS - Solution exclusively uses Google Cloud Vertex AI APIs and official SDKs
  - ✅ PASS - Modifying existing `gemini-cli` codebase, specifically authentication and model configuration modules
  - ✅ PASS - Does not conflict with 3-layer memory architecture (authentication is orthogonal to memory)

- **Principle V: Supported Model List**: ✅ PASS - Authentication fixes apply to all specified model aliases (deepseek-v3, deepseek-r1, qwen-coder, claude-sonnet, gemini, kimi-k2)

**Gate Status**: ✅ APPROVED - No constitutional violations. Feature aligns with all core principles.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-model-auth/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── model-auth-contracts.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/vtx_cli/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── core/
│   │       │   ├── contentGenerator.ts          # Auth type configuration
│   │       │   └── vertexAiContentGenerator.ts  # Vertex AI content generation
│   │       ├── auth/
│   │       │   ├── CredentialManager.ts         # Credential management
│   │       │   ├── APIKeyProvider.ts            # API key provider
│   │       │   └── ServiceAccountProvider.ts    # Service account provider
│   │       ├── mcp/
│   │       │   └── google-auth-provider.ts      # ADC provider
│   │       └── services/
│   │           └── modelService.ts              # Model configuration service
│   └── cli/
│       └── src/
│           ├── config/
│           │   └── auth.ts                      # Auth validation
│           └── adapters/
│               ├── openapi-adapter.ts           # OpenAPI endpoint adapter (NEW)
│               ├── claude-sdk-adapter.ts        # Claude SDK adapter (NEW)
│               └── gemini-sdk-adapter.ts       # Gemini SDK adapter (NEW)
├── configs/
│   └── models.yaml                              # Model configuration (UPDATE)
└── integration-tests/
    └── model-auth/                              # New test directory
        ├── bearer-token-auth.test.ts
        ├── claude-sdk-auth.test.ts
        └── gemini-sdk-auth.test.ts

tests/
└── unit/
    └── model-auth/                              # New test directory
        ├── openapi-adapter.test.ts
        ├── claude-sdk-adapter.test.ts
        └── gemini-sdk-adapter.test.ts
```

**Structure Decision**: Single project structure (Option 1) as this is a TypeScript Node.js CLI application with workspace packages. Authentication fixes span across `core` package (authentication logic) and `cli` package (model-specific adapters).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. This section is not applicable.

## Post-Design Constitution Re-Check

_Re-evaluation after Phase 0 (Research) and Phase 1 (Design) completion._

### Verification Against Each Principle

- **Principle I: Optimize Vertex AI Credits**: ✅ CONFIRMED

  - Design uses official Google Cloud SDKs and authentication libraries
  - Bearer token caching reduces auth API calls
  - All authentication flows target Vertex AI endpoints exclusively
  - No third-party authentication services required

- **Principle II: Extensibility & Flexibility**: ✅ CONFIRMED

  - Adapter pattern allows adding new authentication methods per model
  - Model configuration is extensible via YAML
  - Detection logic is model-specific and extensible
  - No hard dependencies between authentication methods

- **Principle III: Personalization (Statefulness)**: ✅ CONFIRMED

  - Credentials cached via HybridTokenStorage (OS keychain/encrypted files)
  - Token refresh maintains session continuity for all methods
  - User preferences for authentication method respected per model
  - State preserved across application restarts

- **Principle IV: Guardrails**: ✅ CONFIRMED

  - **Vertex AI Only**: All auth flows use `*.googleapis.com` endpoints or official SDKs
  - **Modify gemini-cli**: Implementation modifies existing files in `packages/core` and `packages/cli`
  - **3-Layer Memory**: Authentication system is independent, doesn't affect memory architecture

- **Principle V: Supported Model List**: ✅ CONFIRMED
  - Model-specific authentication methods work for all specified models:
    - DeepSeek v3.1, DeepSeek R1, Qwen Coder, Kimi K2 (bearer tokens via OpenAPI)
    - Claude Sonnet 4.5 (Claude SDK)
    - Gemini 2.5 Pro (Gemini SDK with Vertex AI mode)
  - Each model uses its optimal authentication method as designed

**Final Constitutional Status**: ✅ ALL PRINCIPLES UPHELD

The design maintains full constitutional compliance. No violations were introduced during research or design phases.

## Phase Completion Summary

### Phase 0: Research ✅ COMPLETE

- **Output**: [research.md](./research.md)
- **Key Findings**:
  - Best practices for bearer token authentication via OpenAPI endpoints
  - Google Gen AI Python SDK patterns for Vertex AI mode
  - Anthropic Vertex AI SDK patterns for Claude models
  - Token caching and refresh strategies
  - Error handling and dependency management

### Phase 1: Design ✅ COMPLETE

- **Outputs**:
  - [data-model.md](./data-model.md) - Entity definitions and state transitions
  - [contracts/model-auth-contracts.md](./contracts/model-auth-contracts.md) - API contracts and behaviors
  - [quickstart.md](./quickstart.md) - Developer implementation guide
- **Key Deliverables**:
  - Data entities: ModelAuthConfig, BearerTokenAuth, SDKAuth, etc.
  - Contracts: Adapter interfaces, validation rules, error handling
  - Implementation patterns for model-specific authentication

### Next Phase: Tasks (Use `/speckit.tasks` command)

- Break down implementation into atomic, testable tasks
- Assign priorities and dependencies
- Create task checklist for implementation tracking

