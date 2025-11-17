# Implementation Plan: Vertex AI Authentication Improvement

**Branch**: `002-vertex-auth` | **Date**: November 16, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-vertex-auth/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Improve Vertex AI authentication to support multiple authentication methods (Application Default Credentials, service account JSON keys, and Google Cloud API keys) with automatic detection, clear error messaging, and automatic credential refresh. This enhancement ensures seamless access to all Vertex AI models (Gemini, Claude, Qwen, DeepSeek, etc.) across various deployment environments while maintaining security and usability.

## Technical Context

**Language/Version**: TypeScript (target ES2022), Node.js >= 20.0.0  
**Primary Dependencies**:

- `google-auth-library@^9.11.0` (authentication)
- `@google-cloud/vertexai@^1.10.0` (native Vertex AI SDK)
- `@google/genai@1.16.0` (Gemini API SDK)
- `@modelcontextprotocol/sdk@^1.11.0` (MCP integration)

**Storage**: Hybrid credential storage (keychain/filesystem) via HybridTokenStorage  
**Testing**: Vitest (unit and integration tests), MSW for API mocking  
**Target Platform**: Cross-platform CLI (Linux, macOS, Windows), containerized environments (Docker/Podman), CI/CD systems  
**Project Type**: Single monorepo workspace with packages (`@google/gemini-cli-core`, `@google/gemini-cli`)  
**Performance Goals**:

- Authentication completion < 5 seconds
- Token refresh < 2 seconds
- Support 1000+ consecutive requests without credential errors

**Constraints**:

- Must use only Vertex AI endpoints (no direct OpenAI/Anthropic APIs)
- Must maintain backward compatibility with existing authentication flows
- Must work in both interactive and non-interactive environments
- Must securely store credentials

**Scale/Scope**:

- Multiple authentication methods (3: ADC, service account, API key)
- All Vertex AI models in configuration (~9 models: Gemini, Claude, Qwen, DeepSeek, Llama, Gemma, Mistral)
- Global and regional endpoints support
- Existing codebase: ~500+ files in `src/vtx_cli`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I: Optimize Vertex AI Credits**: ✅ PASS - Solution uses native Vertex AI authentication mechanisms (ADC, service accounts, API keys) exclusively for accessing Vertex AI models. No external authentication services required.

- **Principle II: Extensibility & Flexibility**: ✅ PASS - Authentication system maintains modular architecture allowing new authentication methods to be added without modifying existing code. Uses adapter pattern for different credential types.

- **Principle III: Personalization (Statefulness)**: ✅ PASS - Credential caching and session management preserve user state across sessions. Supports persistent authentication without repeated logins.

- **Principle IV: Guardrails**:

  - ✅ PASS - Solution exclusively uses Google Cloud Vertex AI APIs (via google-auth-library and @google-cloud/vertexai)
  - ✅ PASS - Modifying existing `gemini-cli` codebase, specifically authentication modules
  - ✅ PASS - Does not conflict with 3-layer memory architecture (authentication is orthogonal to memory)

- **Principle V: Supported Model List**: ✅ PASS - Authentication improvements apply to all configured model aliases (gemini, claude, qwen-coder, deepseek, and additional models)

**Gate Status**: ✅ APPROVED - No constitutional violations. Feature aligns with all core principles.

## Project Structure

### Documentation (this feature)

```text
specs/002-vertex-auth/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── authentication-flow.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/vtx_cli/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── code_assist/
│   │       │   ├── oauth2.ts                    # OAuth authentication logic
│   │       │   └── oauth-credential-storage.ts  # Credential persistence
│   │       ├── core/
│   │       │   ├── contentGenerator.ts          # Auth type configuration
│   │       │   └── apiKeyCredentialStorage.ts   # API key storage
│   │       ├── mcp/
│   │       │   ├── google-auth-provider.ts      # ADC provider for MCP
│   │       │   ├── sa-impersonation-provider.ts # Service account impersonation
│   │       │   └── token-storage/
│   │       │       └── hybrid-token-storage.ts  # Secure credential storage
│   │       └── config/
│   │           └── storage.ts                   # Storage configuration
│   └── cli/
│       └── src/
│           ├── config/
│           │   └── auth.ts                      # Auth validation
│           ├── validateNonInterActiveAuth.ts     # Non-interactive auth
│           └── zed-integration/
│               └── zedIntegration.ts            # Auth method listing
├── configs/
│   └── models.yaml                              # Model configuration
└── integration-tests/
    └── authentication/                          # New test directory
        ├── adc-auth.test.ts
        ├── service-account-auth.test.ts
        └── api-key-auth.test.ts

tests/
└── unit/
    └── authentication/                          # New test directory
        ├── credential-detection.test.ts
        ├── credential-refresh.test.ts
        └── error-messaging.test.ts
```

**Structure Decision**: Single project structure (Option 1) as this is a TypeScript Node.js CLI application with workspace packages. Authentication improvements span across `core` package (authentication logic) and `cli` package (validation and user interaction).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. This section is not applicable.

## Post-Design Constitution Re-Check

_Re-evaluation after Phase 0 (Research) and Phase 1 (Design) completion._

### Verification Against Each Principle

- **Principle I: Optimize Vertex AI Credits**: ✅ CONFIRMED

  - Design uses `google-auth-library` (Google's official library)
  - Token caching reduces auth API calls
  - All authentication flows target Vertex AI endpoints exclusively
  - No third-party authentication services required

- **Principle II: Extensibility & Flexibility**: ✅ CONFIRMED

  - CredentialProvider interface allows adding new auth methods
  - Detection logic is priority-based and extensible
  - Token caching pattern is reusable across providers
  - No hard dependencies between authentication methods

- **Principle III: Personalization (Statefulness)**: ✅ CONFIRMED

  - Credentials cached via HybridTokenStorage (OS keychain/encrypted files)
  - Token refresh maintains session continuity
  - User preferences for authentication method respected
  - State preserved across application restarts

- **Principle IV: Guardrails**: ✅ CONFIRMED

  - **Vertex AI Only**: All auth flows use `*.googleapis.com` endpoints
  - **Modify gemini-cli**: Implementation modifies existing files in `packages/core` and `packages/cli`
  - **3-Layer Memory**: Authentication system is independent, doesn't affect memory architecture

- **Principle V: Supported Model List**: ✅ CONFIRMED
  - Unified bearer token authentication works for all models:
    - Gemini 2.5 Pro (via @google/genai SDK)
    - Claude Sonnet 4.5 (via Vertex AI REST API)
    - Qwen, DeepSeek, Kimi (via OpenAI-compatible Vertex AI endpoints)
  - Same authentication credentials for all models as designed

**Final Constitutional Status**: ✅ ALL PRINCIPLES UPHELD

The design maintains full constitutional compliance. No violations were introduced during research or design phases.

## Phase Completion Summary

### Phase 0: Research ✅ COMPLETE

- **Output**: [research.md](./research.md)
- **Key Findings**:
  - 3 authentication methods supported (ADC, Service Account, API Key)
  - Priority-based detection with clear hierarchy
  - Token caching with 5-minute proactive refresh
  - Structured error messages with remediation steps

### Phase 1: Design ✅ COMPLETE

- **Outputs**:
  - [data-model.md](./data-model.md) - Entity definitions and state transitions
  - [contracts/authentication-flow.md](./contracts/authentication-flow.md) - API contracts and behaviors
  - [quickstart.md](./quickstart.md) - Developer implementation guide
- **Key Deliverables**:
  - Data entities: AuthenticationType, CredentialSource, AccessToken, etc.
  - Contracts: CredentialProvider interface, validation rules, error handling
  - Implementation patterns for token caching and refresh

### Next Phase: Tasks (Use `/speckit.tasks` command)

- Break down implementation into atomic, testable tasks
- Assign priorities and dependencies
- Create task checklist for implementation tracking
