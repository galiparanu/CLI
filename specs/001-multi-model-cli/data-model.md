# Data Model: Multi-Model CLI

**Input**: `spec.md` and `research.md`.

This document defines the key data structures for the application.

## 1. Model Configuration (`models.yaml`)

This structure defines how a model is represented in the configuration file.

- **Entity**: `ModelConfig`
- **Fields**:
  - `name` (string, required): The full name for display (e.g., "Claude Sonnet 4.5").
  - `endpoint_id` (string, required): The exact Vertex AI endpoint ID.
  - `adapter` (string, required): The name of the adapter function/class to use for formatting API requests (e.g., `gemini`, `claude`).
- **Example**:
  ```yaml
  claude:
    name: "Claude Sonnet 4.5"
    endpoint_id: "anthropic-claude-sonnet-4-5"
    adapter: "claude_adapter"
  gemini:
    name: "Gemini 2.5 Pro"
    endpoint_id: "gemini-2-5-pro"
    adapter: "gemini_adapter"
  ```

## 2. CLI State

This structure represents the runtime state of the CLI application.

- **Entity**: `CliState`
- **Fields**:
  - `active_model_alias` (string): The alias of the currently selected model (e.g., "claude"). Defaults to "gemini".
  - `history` (list of `Message`): The short-term conversation history.
  - `persona` (string): The content of the JARVIS system prompt.
- **State Transitions**:
  - `active_model_alias` is updated by the `/model` command.
  - `history` is appended to after each request/response cycle.
  - `persona` is loaded once at startup.

## 3. Message

This structure represents a single message in the conversation history.

- **Entity**: `Message`
- **Fields**:
  - `role` (string): The role of the sender ("user" or "model").
  - `content` (string): The text of the message.
- **Validation**: `role` must be either "user" or "model".

## 4. Persona (`persona.txt`)

A simple text file containing the full JARVIS system prompt.

- **Entity**: `Persona`
- **Fields**: None, it is a flat text file.
- **Usage**: The content is loaded into `CliState.persona` at startup and prepended to the message history sent to the model API, formatted according to the model's adapter.
