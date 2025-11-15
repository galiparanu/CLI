# Feature Specification: Multi-Model CLI

**Feature Branch**: `001-multi-model-cli`  
**Created**: 2025-11-16  
**Status**: Draft  
**Input**: User description: "As a personal developer, I want to run prompts against specific models like Claude Sonnet or Qwen Coder through my terminal, so that I have the freedom to choose the most appropriate model for my coding task."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Select and Use a Model (Priority: P1)

As a developer, I want to switch the active model in the CLI and run a prompt against it, so I can use the best tool for my current task.

**Why this priority**: This is the core "happy path" functionality and delivers the primary value of the feature.

**Independent Test**: The feature can be tested by starting the CLI, switching to a valid model, entering a prompt, and verifying that the correct model was called and a response is displayed.

**Acceptance Scenarios**:

1.  **Given** the CLI is running in interactive mode,
    **When** I type `/model claude` and press Enter,
    **Then** the CLI responds with "Active model is now: claude (Claude Sonnet 4.5)."
2.  **Given** the active model is `claude`,
    **When** I type the prompt "Create a python function for fibonacci." and press Enter,
    **Then** the CLI sends the prompt to the Vertex AI `claude-sonnet-4.5` model, includes the JARVIS persona system prompt, and displays the model's response.

---

### User Story 2 - Handle Invalid Model Selection (Priority: P2)

As a developer, I want to be notified if I try to select a model that doesn't exist, so I can correct my mistake and understand the available options.

**Why this priority**: This provides essential error handling and improves usability by making the system's limitations clear.

**Independent Test**: This can be tested by starting the CLI, attempting to switch to a model name that is not in the supported list, and verifying the correct error message is shown and the active model does not change.

**Acceptance Scenarios**:

1.  **Given** the CLI is running and the active model is `gemini`,
    **When** I type `/model llama3` and press Enter,
    **Then** the CLI responds with "Error: Model 'llama3' not found. Available models are: gemini, claude, qwen-coder, deepseek."
2.  **Given** an invalid model was just entered,
    **When** I enter a new prompt,
    **Then** the CLI uses the previously active model (`gemini`) for the API call.

---

### Edge Cases

- **API Failure**: What happens if the Vertex AI API call fails due to network issues, authentication errors, or rate limiting? The CLI should display a clear error message to 'Sir'.
- **Empty Prompt**: How does the system handle an empty or whitespace-only prompt submission? It should likely do nothing or prompt 'Sir' for input.
- **Model Switch During Multi-line**: What happens if the user tries to switch models while in the middle of entering a multi-line prompt? The command should likely be executed, changing the model for the subsequent prompt.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST allow a user to set an active model by using the `/model [alias]` command, where `[alias]` is one of the supported models.
- **FR-002**: The system MUST inject the full "JARVIS Constitution" system prompt into every API call made to any model.
- **FR-003**: The system MUST validate the requested model alias against the supported list (`gemini`, `claude`, `qwen-coder`, `deepseek`).
- **FR-004**: If an invalid model alias is provided, the system MUST display an error message that includes the list of available models.
- **FR-005**: The currently active model MUST persist for the duration of the CLI session or until changed again by the user.
- **FR-006**: Upon successfully switching models, the CLI MUST confirm the change by displaying the new active model and its full name (e.g., "Active model is now: claude (Claude Sonnet 4.5)").

### Key Entities _(include if feature involves data)_

- **Model**: Represents a specific large language model available through Vertex AI. Each model is mapped to a user-friendly alias.
- **Alias**: A short, user-facing name for a model (e.g., `claude`, `gemini`).
- **Persona**: The "JARVIS Constitution" system prompt that defines the AI's behavior and MUST be prepended to every user prompt sent to the model API.
- **CLI State**: A runtime object that holds the current state of the interactive session, primarily the currently active model alias.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can successfully switch between any two supported models in under 1 second.
- **SC-002**: 100% of prompts sent from the CLI must include the complete and unmodified JARVIS persona system prompt.
- **SC-003**: When an invalid model is requested, the system provides an error message and a list of valid models within 500ms.
- **SC-004**: The task completion rate for selecting a model and receiving a response for a valid prompt should be 100%.
