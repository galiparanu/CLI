<!--
Sync Impact Report
- Version change: 0.0.0 → 1.0.0
- Modified principles: N/A (Initial version)
- Added sections: Core Principles, Project Mission, Governance
- Removed sections: N/A
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: None
-->

# Multi-Model CLI Constitution

## Core Principles

### I. Optimize Vertex AI Credits

The top priority is to utilize existing Vertex AI credits. All architecture (models, memory) must prioritize using native Vertex AI services.

### II. Extensibility & Flexibility

The code architecture must be modular to easily add new models or features (like memory) in the future.

### III. Personalization (Statefulness)

This tool is for personal use and must be designed to store state (memory) and behavioral customizations (persona).

### IV. Guardrails

- Platform: Use only Google Cloud Vertex AI APIs. No external APIs (e.g., OpenAI).
- Codebase: Modify (fork) an existing gemini-cli, do not build from scratch.
- Memory Architecture: A 3-layer hybrid system.
  - Short-term: RAM (current conversation context).
  - Mid-term: Local storage (e.g., JSON/SQLite file for chat history).
  - Long-term: Vertex AI Vector Search (for semantic retrieval).

### V. Supported Model List (Aliases)

- `gemini` (using Gemini 2.5 Pro)
- `claude` (using Claude Sonnet 4.5)
- `qwen-coder` (using Qwen3-Coder)
- `deepseek` (using DeepSeek-Coder)

## Project Mission

To modify the existing gemini-cli into a multi-model CLI connected to Vertex AI, enabling it to call Google models (Gemini) and third-party models (Claude, Qwen, DeepSeek) available in the Vertex AI Model Garden.

## Governance

This Constitution supersedes all other practices. Amendments require documentation, approval, and a migration plan. All PRs/reviews must verify compliance with this constitution. Complexity must be justified.

**Version**: 1.0.0 | **Ratified**: 2025-11-16 | **Last Amended**: 2025-11-16
