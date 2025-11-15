# Research: Multi-Model CLI

**Input**: `plan.md`'s Technical Context section.

This document resolves the "NEEDS CLARIFICATION" items from the implementation plan.

## 1. `gemini-cli` Forking and Project Setup

- **Decision**: Fork `gemini-cli` from its official repository. The project will be structured as a standard Python CLI application.
- **Rationale**: The constitution requires modifying an existing `gemini-cli`. Forking is the standard way to start.
- **Alternatives considered**: None, this is a hard constraint.

## 2. Vertex AI API Integration

- **Decision**: Use the `google-cloud-aiplatform` Python library. Authentication will be handled via the gcloud CLI (`gcloud auth application-default login`).
- **Rationale**: This is the official and recommended library for interacting with Vertex AI services, providing the most robust support for different models. Application Default Credentials (ADC) is the standard local development authentication method.
- **Alternatives considered**:
  - Using raw REST APIs: Rejected due to complexity and maintenance overhead. The SDK handles authentication, request signing, and response parsing.

## 3. Model Dispatch and Configuration

- **Decision**: A YAML file (`configs/models.yaml`) will map model aliases to their specific Vertex AI endpoint IDs and required API call structure. A "Model Dispatcher" service will read this config and format the payload accordingly.
- **Rationale**: Different models on Vertex AI (e.g., Gemini vs. Claude) may have slightly different request/response schemas. A config-driven dispatcher makes the system extensible (Principle II) without requiring code changes to add new models.
- **Alternatives considered**:
  - Hardcoding the model details: Rejected as it violates the extensibility principle.

## 4. Memory System Implementation

- **Decision**:
  - **Short-Term**: In-memory Python list/object (existing `gemini-cli` pattern).
  - **Mid-Term**: A simple JSON file (`history.json`) to append chat history.
  - **Long-Term**: `google-cloud-aiplatform.matching_engine` for Vertex AI Vector Search.
- **Rationale**: This directly implements the 3-layer memory architecture from the constitution (Principle IV). It balances simplicity for recent history with powerful semantic search for long-term context.
- **Alternatives considered**:
  - SQLite for mid-term memory: Rejected as overkill for a personal CLI tool. A simple JSON log is sufficient and easier to inspect.
  - Other vector databases: Rejected as it violates the "Optimize Vertex AI Credits" principle (Principle I).
