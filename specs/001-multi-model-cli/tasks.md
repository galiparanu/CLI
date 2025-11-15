# Tasks: Multi-Model CLI

**Input**: Design documents from `/home/senarokalie/Desktop/claude/specs/001-multi-model-cli/`
**Prerequisites**: plan.md, spec.md, data-model.md

## Phase 1: Setup (Project Preparation)

**Purpose**: Fork the original `gemini-cli` and prepare the development environment.

- [x] T001 Fork the `gemini-cli` repository into the local workspace
- [x] T002 Create a `requirements.txt` file for the project
- [x] T003 Add `google-cloud-aiplatform` and `PyYAML` to `requirements.txt`
- [x] T004 Install dependencies using `pip install -r requirements.txt`
- [x] T005 Create the directory structure `src/vtx_cli`, `configs`, and `tests`
- [x] T006 Move the forked `gemini-cli` source code into `src/vtx_cli`
- [x] T007 Create an empty `configs/models.yaml` file
- [x] T008 Create a `persona.txt` file and add the JARVIS system prompt to it

---

## Phase 2: Foundational (API Transplant & Refactoring)

**Purpose**: Replace the original Google AI API with the Vertex AI SDK and refactor the core logic to support the `gemini` model on Vertex AI. This phase corresponds to the user's request for sub-tasks.

- [x] T009 [P] Identify the file in `src/vtx_cli` responsible for making API calls (e.g., `gemini_client.py`)
- [x] T010 [P] Identify the core chat/prompt function in `src/vtx_cli` that uses the API client
- [ ] T011 Import `aiplatform` from `google.cloud` in the API client file
- [ ] T012 Initialize the Vertex AI client `aiplatform.init(project='[YOUR_PROJECT_ID]', location='[YOUR_REGION]')` in the API client file
- [ ] T013 Remove the old `genai.GenerativeModel` client initialization
- [ ] T014 Replace the old client with `aiplatform.GenerativeModel("gemini-1.5-pro-001")`
- [ ] T015 Refactor the core chat function to use the new Vertex AI client's `send_message` method
- [ ] T016 Create a unit test in `tests/unit/test_api_transplant.py` to call the refactored chat function
- [ ] T017 Run the test and verify that a successful API call is made to the Vertex AI `gemini` model

---

## Phase 3: User Story 1 - Select and Use a Model (Priority: P1) 🎯 MVP

**Goal**: Allow a user to switch the active model and run a prompt against it.

**Independent Test**: Start the CLI, run `/model claude`, enter a prompt, and verify the response comes from Claude.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Populate `configs/models.yaml` with entries for `gemini`, `claude`, `qwen-coder`, and `deepseek`
- [ ] T019 [P] [US1] Create a `CliState` model in `src/vtx_cli/models/state.py` to manage the active model
- [ ] T020 [P] [US1] Create a `ModelService` in `src/vtx_cli/services/model_service.py` to load `models.yaml`
- [ ] T021 [US1] Implement the `/model <alias>` command logic in `src/vtx_cli/commands/model_command.py`
- [ ] T022 [US1] Create a `ModelDispatcher` in `src/vtx_cli/services/dispatcher.py`
- [ ] T023 [US1] Implement a `gemini_adapter` function in the dispatcher for Gemini-like request formats
- [ ] T024 [US1] Implement a `claude_adapter` function in the dispatcher for Claude's request format
- [ ] T025 [US1] Modify the core chat function to use the `ModelDispatcher` to format the API payload based on the active model's adapter
- [ ] T026 [US1] Modify the core chat function to load the `persona.txt` and inject it into every API call

---

## Phase 4: User Story 2 - Handle Invalid Model Selection (Priority: P2)

**Goal**: Notify the user when they select a model that does not exist.

**Independent Test**: Start the CLI, run `/model invalid-model`, and verify the correct error message is displayed.

### Implementation for User Story 2

- [ ] T027 [US2] In `src/vtx_cli/commands/model_command.py`, add validation to check if the requested model alias exists in the loaded config
- [ ] T028 [US2] If the model is invalid, print an error message including the list of available model aliases from the config
- [ ] T029 [US2] Ensure the `CliState`'s active model is not changed if the validation fails

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** must be completed before any other phase.
- **Phase 2 (Foundational)** depends on Phase 1. It is a critical step that enables all user stories.
- **Phase 3 (User Story 1)** depends on Phase 2.
- **Phase 4 (User Story 2)** depends on Phase 3.

### Parallel Opportunities

- Within Phase 2, T009 and T010 can be done in parallel.
- Within Phase 3, T018, T019, and T020 can be done in parallel.
