# Feature Specification: Vertex AI Authentication Improvement

**Feature Branch**: `002-vertex-auth`  
**Created**: November 16, 2025  
**Status**: Draft  
**Input**: User description: "memperbaiki metode autentikasi agar dapat menggunakan model di vertex"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Seamless Model Access with Valid Credentials (Priority: P1)

Users with properly configured Vertex AI credentials can successfully authenticate and access all configured models (Gemini, Claude, Qwen, DeepSeek) without authentication errors or manual intervention.

**Why this priority**: This is the core functionality that enables users to access Vertex AI models. Without working authentication, no other features can function.

**Independent Test**: Can be fully tested by configuring valid Vertex AI credentials and sending a request to any model in the configuration, expecting successful response without authentication errors.

**Acceptance Scenarios**:

1. **Given** a user has valid Application Default Credentials configured via gcloud, **When** they request to use any Vertex AI model, **Then** the system authenticates successfully and processes the request
2. **Given** a user has a valid service account JSON key configured, **When** they send a request to access Claude or Gemini models, **Then** the authentication succeeds and the model responds
3. **Given** a user has a valid Google Cloud API key configured, **When** they attempt to use Vertex AI models in express mode, **Then** the system authenticates and allows model access

---

### User Story 2 - Clear Error Messages for Authentication Failures (Priority: P2)

When authentication fails due to missing or invalid credentials, users receive clear, actionable error messages that explain what's wrong and how to fix it.

**Why this priority**: Reduces user frustration and support burden by helping users self-diagnose and resolve authentication issues.

**Independent Test**: Can be tested by intentionally providing invalid credentials or removing required environment variables, and verifying that error messages clearly indicate the problem and solution steps.

**Acceptance Scenarios**:

1. **Given** required environment variables (GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION) are not set, **When** a user attempts Vertex AI authentication, **Then** the system displays a clear message listing the missing variables and how to set them
2. **Given** a user provides an expired or invalid service account key, **When** authentication is attempted, **Then** the system provides specific feedback about the credential issue
3. **Given** a user's credentials lack necessary permissions, **When** they try to access a model, **Then** the error message indicates the permission issue and suggests required IAM roles

---

### User Story 3 - Support Multiple Authentication Methods (Priority: P1)

Users can choose from multiple authentication methods (ADC, service account, API key) based on their environment and organizational requirements, with the system automatically detecting and using the appropriate method.

**Why this priority**: Different users and organizations have different security policies and deployment scenarios. Supporting multiple methods ensures broad usability.

**Independent Test**: Can be tested by configuring each authentication method separately and verifying that the system correctly identifies and uses each method without requiring code changes.

**Acceptance Scenarios**:

1. **Given** a user sets GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key, **When** the system initializes, **Then** it uses service account authentication automatically
2. **Given** a user has gcloud ADC configured but no service account key, **When** authentication is requested, **Then** the system falls back to ADC
3. **Given** a user provides GOOGLE_API_KEY in their environment, **When** using Vertex AI in express mode, **Then** the system uses API key authentication

---

### User Story 4 - Credential Refresh and Session Management (Priority: P2)

The system automatically refreshes expired credentials without user intervention, maintaining uninterrupted access to Vertex AI models during long-running sessions.

**Why this priority**: Prevents session interruptions and improves user experience by handling credential lifecycle automatically.

**Independent Test**: Can be tested by starting a session, waiting for credential expiration time, and verifying that subsequent requests still succeed without manual re-authentication.

**Acceptance Scenarios**:

1. **Given** an active session with credentials nearing expiration, **When** a request is made, **Then** the system automatically refreshes the credentials before they expire
2. **Given** cached credentials have expired, **When** a new request is initiated, **Then** the system obtains fresh credentials transparently
3. **Given** a long-running interactive session, **When** multiple requests are made over time, **Then** users never encounter authentication errors due to expired tokens

---

### Edge Cases

- What happens when a user has multiple authentication methods configured simultaneously (e.g., both API key and service account)?
- How does the system handle network interruptions during authentication?
- What occurs when a user switches from one authentication method to another mid-session?
- How does the system behave when credentials are valid but the Vertex AI API is temporarily unavailable?
- What happens when environment variables are set but contain empty strings versus not being set at all?
- How does the system handle authentication when running in restricted environments (CI/CD, containers) without interactive capabilities?
- What occurs when a user's Google Cloud project has Vertex AI API disabled?
- How does the system manage authentication across different regions specified in GOOGLE_CLOUD_LOCATION?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST support Application Default Credentials (ADC) authentication for users with gcloud CLI configured
- **FR-002**: The system MUST support service account JSON key file authentication via GOOGLE_APPLICATION_CREDENTIALS environment variable
- **FR-003**: The system MUST support Google Cloud API key authentication via GOOGLE_API_KEY environment variable
- **FR-004**: The system MUST automatically detect which authentication method is configured and use it without requiring explicit user selection
- **FR-005**: The system MUST validate that required environment variables (GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION) are set when using project-based authentication
- **FR-006**: The system MUST provide clear error messages when authentication fails, including specific guidance on missing or invalid credentials
- **FR-007**: The system MUST automatically refresh expired credentials without requiring user intervention
- **FR-008**: The system MUST work with all configured Vertex AI models (Gemini, Claude, Qwen, DeepSeek, Llama, Gemma, Mistral)
- **FR-009**: The system MUST respect authentication method enforcement when configured in security settings
- **FR-010**: The system MUST handle authentication in both interactive and non-interactive environments (CI/CD, containers)
- **FR-011**: The system MUST maintain credential security by using secure storage mechanisms where available
- **FR-012**: The system MUST validate credentials have necessary IAM permissions for Vertex AI access

### Key Entities _(include if feature involves data)_

- **Credential**: Authentication information used to access Vertex AI, can be ADC, service account key, or API key
- **Authentication Method**: The type of authentication being used (oauth-personal, vertex-ai, gemini-api-key, compute-default-credentials)
- **Access Token**: Temporary token obtained from credentials to authenticate API requests
- **Environment Configuration**: Set of environment variables (GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_API_KEY) that determine authentication behavior
- **Credential Cache**: Temporarily stored authentication information to avoid repeated authentication requests
- **IAM Permission**: Google Cloud IAM role required for Vertex AI access (e.g., "Vertex AI User" role)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can successfully authenticate and access Vertex AI models within 30 seconds of providing valid credentials
- **SC-002**: Authentication error messages include specific remediation steps, reducing support requests by at least 60%
- **SC-003**: 100% of supported authentication methods (ADC, service account, API key) work correctly across all configured models
- **SC-004**: Credential refresh occurs automatically without user intervention, maintaining 99.9% uptime for active sessions
- **SC-005**: Users can switch between authentication methods by only changing environment variables, without code modifications
- **SC-006**: Authentication failures are detected and reported within 5 seconds of request initiation
- **SC-007**: The system successfully handles at least 1000 consecutive authenticated requests without credential expiration errors

## Assumptions

- Users have administrative access to their environment to set environment variables
- Users with service account authentication have already created service accounts with appropriate IAM roles
- The Vertex AI API is enabled in the user's Google Cloud project
- Users understand basic concepts of environment variables and command-line configuration
- Network connectivity to Google Cloud APIs is available and stable
- Users running in restricted environments (containers, CI/CD) have proper credential mounting or secrets management configured
- Organizations that enforce specific authentication types have updated their security settings accordingly

## Dependencies

- Google Cloud project with Vertex AI API enabled
- Valid Google Cloud credentials (ADC, service account, or API key)
- Network access to Google Cloud endpoints (\*.googleapis.com)
- Proper IAM roles assigned (minimum "Vertex AI User" role for service accounts)
- For ADC: gcloud CLI installed and configured
- For service account: JSON key file accessible to the application
- For API key: Valid API key with Vertex AI API access enabled

## Out of Scope

- Creating or managing Google Cloud projects
- Setting up IAM roles and permissions within Google Cloud
- Installing or configuring gcloud CLI
- Creating service accounts or generating service account keys
- Obtaining Google Cloud API keys
- Modifying Vertex AI model capabilities or availability
- Handling authentication for non-Vertex AI services
- Implementing custom authentication protocols beyond Google Cloud's standard methods
- Managing billing or quota settings in Google Cloud
- Providing authentication for models outside of Vertex AI
