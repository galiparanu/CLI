# Tasks: Vertex AI Authentication Improvement

**Input**: Design documents from `/specs/002-vertex-auth/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the specification, so test tasks are excluded. Focus is on implementation and validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic authentication structure

- [x] T001 Review existing authentication codebase in src/vtx_cli/packages/core/src/ and src/vtx_cli/packages/cli/src/
- [x] T002 [P] Create types file for authentication entities in src/vtx_cli/packages/core/src/types/authentication.ts
- [x] T003 [P] Create AuthenticationError class in src/vtx_cli/packages/core/src/errors/AuthenticationError.ts
- [x] T004 [P] Create CredentialSource enum in src/vtx_cli/packages/core/src/types/authentication.ts
- [x] T005 [P] Create ValidationResult interface in src/vtx_cli/packages/core/src/types/authentication.ts

**Checkpoint**: Foundation types ready - authentication implementation can now begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core authentication detection and validation that all user stories depend on

- [ ] T006 Enhance getAuthTypeFromEnv() in src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts to detect credential sources
- [ ] T007 [P] Add detectCredentialSource() function in src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts
- [ ] T008 [P] Add validateEnvironmentConfig() function in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T009 Enhance validateAuthMethod() in src/vtx_cli/packages/cli/src/config/auth.ts with detailed validation rules
- [ ] T010 [P] Add validateServiceAccountFile() helper in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T011 [P] Add validateGCPProjectId() helper in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T012 [P] Add validateGCPRegion() helper in src/vtx_cli/packages/cli/src/config/auth.ts

**Checkpoint**: Detection and validation infrastructure complete - BLOCKS all user stories until done

---

## Phase 3: User Story 1 - Seamless Model Access with Valid Credentials (Priority: P1) 🎯 MVP

**Goal**: Users can authenticate and access Vertex AI models using any of the three authentication methods (ADC, service account, API key)

**Independent Test**: Configure valid credentials for each method and send requests to different models, expecting successful responses

### Implementation for User Story 1

- [ ] T013 [P] [US1] Enhance GoogleCredentialProvider in src/vtx_cli/packages/core/src/mcp/google-auth-provider.ts with token caching
- [ ] T014 [P] [US1] Create ServiceAccountProvider class in src/vtx_cli/packages/core/src/auth/ServiceAccountProvider.ts
- [ ] T015 [P] [US1] Create APIKeyProvider class in src/vtx_cli/packages/core/src/auth/APIKeyProvider.ts
- [ ] T016 [US1] Implement token refresh logic in GoogleCredentialProvider with 5-minute buffer
- [ ] T017 [US1] Implement token refresh logic in ServiceAccountProvider with 5-minute buffer
- [ ] T018 [US1] Update createContentGeneratorConfig() in src/vtx_cli/packages/core/src/core/contentGenerator.ts to use new providers
- [ ] T019 [US1] Ensure bearer token authentication works for Gemini models
- [ ] T020 [US1] Ensure bearer token authentication works for Claude models via Vertex AI
- [ ] T021 [US1] Ensure bearer token authentication works for Qwen/DeepSeek models via OpenAI-compatible endpoints
- [ ] T022 [US1] Add debug logging for credential detection in src/vtx_cli/packages/cli/src/validateNonInterActiveAuth.ts
- [ ] T023 [US1] Add debug logging for token acquisition and caching

**Checkpoint**: All three authentication methods working, users can access all configured Vertex AI models

---

## Phase 4: User Story 2 - Clear Error Messages for Authentication Failures (Priority: P2)

**Goal**: Provide actionable error messages when authentication fails

**Independent Test**: Intentionally misconfigure each authentication method and verify error messages include specific remediation steps

### Implementation for User Story 2

- [ ] T024 [P] [US2] Implement structured error messages in AuthenticationError class for MISSING_ENV errors
- [ ] T025 [P] [US2] Implement structured error messages in AuthenticationError class for INVALID_CREDENTIALS errors
- [ ] T026 [P] [US2] Implement structured error messages in AuthenticationError class for PERMISSION_DENIED errors
- [ ] T027 [P] [US2] Implement structured error messages in AuthenticationError class for API_NOT_ENABLED errors
- [ ] T028 [P] [US2] Implement structured error messages in AuthenticationError class for FILE_NOT_FOUND errors
- [ ] T029 [P] [US2] Implement structured error messages in AuthenticationError class for INVALID_JSON errors
- [ ] T030 [US2] Enhance validateAuthMethod() error messages with remediation steps in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T031 [US2] Add error handling for missing GOOGLE_CLOUD_PROJECT with remediation in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T032 [US2] Add error handling for missing GOOGLE_CLOUD_LOCATION with remediation in src/vtx_cli/packages/cli/src/config/auth.ts
- [ ] T033 [US2] Add error handling for invalid service account JSON with remediation in validateServiceAccountFile()
- [ ] T034 [US2] Add error handling for permission errors (401/403) in credential providers with IAM role suggestions
- [ ] T035 [US2] Map HTTP error codes to AuthenticationError codes in credential providers
- [ ] T036 [US2] Add error handling for API not enabled (404) with gcloud command remediation
- [ ] T037 [US2] Update error display formatting to show remediation steps clearly

**Checkpoint**: All authentication failures now provide clear, actionable error messages

---

## Phase 5: User Story 3 - Support Multiple Authentication Methods (Priority: P1)

**Goal**: System automatically detects and uses the appropriate authentication method based on environment configuration

**Independent Test**: Configure each authentication method separately and verify automatic detection without code changes

### Implementation for User Story 3

- [ ] T038 [US3] Implement priority-based detection in detectCredentialSource() - API Key > Service Account > ADC > Compute
- [ ] T039 [US3] Add file existence check for GOOGLE_APPLICATION_CREDENTIALS in detection logic
- [ ] T040 [US3] Add ADC file existence check (~/.config/gcloud/application_default_credentials.json) in detection logic
- [ ] T041 [US3] Add GCE/GKE metadata detection (check environment variables) in detection logic
- [ ] T042 [US3] Ensure detection completes in <100ms (no network calls)
- [ ] T043 [US3] Update createContentGeneratorConfig() to select provider based on detected source
- [ ] T044 [US3] Add integration between detection and provider instantiation
- [ ] T045 [US3] Add logging at DEBUG level for detected authentication method
- [ ] T046 [US3] Handle case where multiple methods are configured (priority wins)
- [ ] T047 [US3] Handle case where no methods are configured (clear error)
- [ ] T048 [US3] Validate each detected method before use

**Checkpoint**: System automatically detects and uses correct authentication method for all scenarios

---

## Phase 6: User Story 4 - Credential Refresh and Session Management (Priority: P2)

**Goal**: Automatically refresh credentials before expiration to maintain uninterrupted sessions

**Independent Test**: Start a session, wait near token expiration, verify subsequent requests succeed without re-authentication

### Implementation for User Story 4

- [ ] T049 [P] [US4] Implement token expiry tracking in CredentialCache class in src/vtx_cli/packages/core/src/auth/CredentialCache.ts
- [ ] T050 [P] [US4] Implement isValid() method checking expiry with 5-minute buffer in CredentialCache
- [ ] T051 [US4] Implement proactive refresh when token < 5 minutes remaining in GoogleCredentialProvider
- [ ] T052 [US4] Implement proactive refresh when token < 5 minutes remaining in ServiceAccountProvider
- [ ] T053 [US4] Add grace period check - never use token with <30 seconds remaining
- [ ] T054 [US4] Implement retry logic for failed refresh (retry once after 1 second)
- [ ] T055 [US4] Implement fallback - clear cache and fetch new token if retry fails
- [ ] T056 [US4] Add concurrent call safety with async/await in credential providers
- [ ] T057 [US4] Ensure cached token returned for concurrent calls within cache window
- [ ] T058 [US4] Add logging for token refresh events at DEBUG level
- [ ] T059 [US4] Implement clearCredentials() method in all providers to force re-authentication
- [ ] T060 [US4] Test credential refresh maintains session for 1000+ consecutive requests

**Checkpoint**: Automatic credential refresh working, long-running sessions maintain uninterrupted access

---

## Phase 7: Edge Cases & Cross-Cutting Concerns

**Purpose**: Handle edge cases and polish the implementation

### Edge Case Handling

- [ ] T061 [P] Handle multiple authentication methods configured simultaneously (priority-based selection)
- [ ] T062 [P] Handle network interruptions during authentication (retry with exponential backoff)
- [ ] T063 [P] Handle credential switch mid-session (clear cache on env change detection)
- [ ] T064 [P] Handle Vertex AI API temporarily unavailable (retry with backoff, clear error)
- [ ] T065 [P] Handle empty string vs undefined environment variables (normalize to undefined)
- [ ] T066 [P] Handle restricted environments (CI/CD, containers) without interactive capabilities
- [ ] T067 [P] Handle Vertex AI API disabled for project (API_NOT_ENABLED error with remediation)
- [ ] T068 [P] Handle different regions in GOOGLE_CLOUD_LOCATION (global vs regional endpoints)

### Security & Performance

- [ ] T069 [P] Ensure credentials never logged (replace with [REDACTED] in logs)
- [ ] T070 [P] Ensure tokens stored in memory only (never persisted to disk)
- [ ] T071 [P] Implement secure credential storage via HybridTokenStorage for API keys
- [ ] T072 [P] Set restrictive file permissions (0600) for cached credential files
- [ ] T073 [P] Ensure HTTPS used for all authentication requests
- [ ] T074 [P] Clear credentials from memory on application exit
- [ ] T075 [P] Clear credentials from memory on explicit logout
- [ ] T076 [P] Optimize token caching to achieve <1ms cache hit time
- [ ] T077 [P] Ensure authentication completes in <5 seconds
- [ ] T078 [P] Ensure token refresh completes in <2 seconds

### Documentation & Validation

- [ ] T079 [P] Update README.md with new authentication environment variables
- [ ] T080 [P] Create migration guide for existing users in docs/
- [ ] T081 [P] Update authentication.md documentation with new methods
- [ ] T082 [P] Add examples for each authentication method in docs/
- [ ] T083 Run quickstart.md validation scenarios
- [ ] T084 Code cleanup and refactoring for consistency
- [ ] T085 Review all error messages for clarity and actionability

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Story 1 (Phase 3 - P1)**: Depends on Foundational - Core authentication functionality
- **User Story 2 (Phase 4 - P2)**: Depends on Foundational - Can run parallel with US1 (different focus)
- **User Story 3 (Phase 5 - P1)**: Depends on Foundational and partially on US1 (needs providers)
- **User Story 4 (Phase 6 - P2)**: Depends on US1 (needs credential providers)
- **Edge Cases (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation for all auth - implements the three credential providers
- **User Story 2 (P2)**: Independent of US1 (error handling), can start after Foundational
- **User Story 3 (P1)**: Depends on US1 providers being implemented
- **User Story 4 (P2)**: Depends on US1 providers for refresh logic

### Recommended Execution Order

**Sequential (Single Developer)**:

1. Phase 1: Setup (T001-T005)
2. Phase 2: Foundational (T006-T012) - MUST COMPLETE before user stories
3. Phase 3: User Story 1 (T013-T023) - MVP functionality
4. Phase 5: User Story 3 (T038-T048) - Auto-detection (depends on US1)
5. Phase 6: User Story 4 (T049-T060) - Refresh logic (depends on US1)
6. Phase 4: User Story 2 (T024-T037) - Error messages (can be done anytime after Foundational)
7. Phase 7: Edge Cases (T061-T085) - Polish

**Parallel (Multiple Developers)**:

- Developer A: Phase 1 → Phase 2 → Phase 3 (US1)
- Developer B: Wait for Phase 2 → Phase 4 (US2)
- Developer C: Wait for Phase 3 → Phase 5 (US3) → Phase 6 (US4)
- All: Phase 7 (Edge Cases) after user stories complete

### Within Each Phase

- Tasks marked [P] can run in parallel (different files, no conflicts)
- Non-[P] tasks must run sequentially or have dependencies
- Complete checkpoint before moving to next phase

### Parallel Opportunities per Phase

**Phase 1 (Setup)**: T002, T003, T004, T005 can all run in parallel

**Phase 2 (Foundational)**: T007-T008 parallel, then T010-T011-T012 parallel after T009

**Phase 3 (US1)**: T013-T014-T015 parallel, then T016-T017 can run parallel

**Phase 4 (US2)**: T024-T029 all parallel (different error codes)

**Phase 7 (Edge Cases)**: Most tasks (T061-T078) can run in parallel

---

## Implementation Strategy

### MVP First (User Stories 1 + 3 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T012) - **CRITICAL BLOCKER**
3. Complete Phase 3: User Story 1 (T013-T023) - Core auth functionality
4. Complete Phase 5: User Story 3 (T038-T048) - Auto-detection
5. **STOP and VALIDATE**: Test with all three auth methods across all models
6. Deploy/demo MVP

**MVP Deliverable**: Users can authenticate with ADC, service account, or API key automatically and access all Vertex AI models.

### Full Feature Delivery

1. Complete MVP (Phases 1, 2, 3, 5)
2. Add Phase 6: User Story 4 (T049-T060) - Credential refresh
3. Add Phase 4: User Story 2 (T024-T037) - Better error messages
4. Add Phase 7: Edge Cases (T061-T085) - Production hardening
5. **VALIDATE**: Run full test suite including edge cases
6. Deploy production version

### Incremental Delivery Strategy

**Week 1**: Setup + Foundational (Phase 1-2) → Foundation ready
**Week 2**: User Story 1 (Phase 3) → Basic auth working, testable independently
**Week 3**: User Story 3 (Phase 5) → Auto-detection, ready for MVP demo
**Week 4**: User Story 4 (Phase 6) → Refresh logic, production-ready sessions
**Week 5**: User Story 2 (Phase 4) → Improved error messages
**Week 6**: Edge Cases (Phase 7) → Production hardening complete

Each increment adds value and is independently testable.

---

## Task Summary

- **Total Tasks**: 85
- **Phase 1 (Setup)**: 5 tasks
- **Phase 2 (Foundational)**: 7 tasks (BLOCKING)
- **Phase 3 (US1 - P1)**: 11 tasks
- **Phase 4 (US2 - P2)**: 14 tasks
- **Phase 5 (US3 - P1)**: 11 tasks
- **Phase 6 (US4 - P2)**: 12 tasks
- **Phase 7 (Edge Cases)**: 25 tasks

**Parallelizable Tasks**: 45 tasks marked [P]
**MVP Scope**: Phases 1, 2, 3, 5 = 34 tasks

---

## Notes

- All tasks include exact file paths for implementation
- [P] tasks can run in parallel (different files, no dependencies)
- [Story] labels (US1-US4) map tasks to user stories from spec.md
- Tests are not included as they were not requested in the specification
- Focus on implementation and manual validation per user story
- Foundational phase (Phase 2) is critical blocker - must complete before any user story work
- MVP focuses on P1 user stories (US1, US3) for fastest time to value
- Phase 7 includes production hardening and edge case handling
- Stop at each checkpoint to validate story independently before proceeding
