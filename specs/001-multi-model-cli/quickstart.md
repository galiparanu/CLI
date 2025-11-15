# Quickstart: Multi-Model CLI

This guide provides instructions on how to set up and run the Multi-Model CLI.

## Prerequisites

1.  **Python**: Ensure you have Python 3.9 or later installed.
2.  **Google Cloud SDK**: Install the `gcloud` CLI and authenticate.
    ```bash
    gcloud auth application-default login
    ```
3.  **Project Setup**: A Google Cloud project with the Vertex AI API enabled.

## Setup

1.  **Fork the Repository**: Fork the `gemini-cli` repository.
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    The `requirements.txt` will include `google-cloud-aiplatform`, `PyYAML`, and `rich`.

## Configuration

1.  **Model Configuration**:
    Create a `configs/models.yaml` file with the following structure:

    ```yaml
    gemini:
      name: "Gemini 2.5 Pro"
      endpoint_id: "gemini-2-5-pro"
      adapter: "gemini_adapter"
    claude:
      name: "Claude Sonnet 4.5"
      endpoint_id: "anthropic-claude-sonnet-4-5"
      adapter: "claude_adapter"
    qwen-coder:
      name: "Qwen3-Coder"
      endpoint_id: "qwen3-coder"
      adapter: "gemini_adapter" # Assuming it uses a similar format
    deepseek:
      name: "DeepSeek-Coder"
      endpoint_id: "deepseek-coder"
      adapter: "gemini_adapter" # Assuming it uses a similar format
    ```

2.  **Persona**:
    Create a `persona.txt` file with the JARVIS system prompt.

## Running the CLI

Execute the main script to start the CLI in interactive mode:

```bash
python src/main.py
```

You will be greeted with a `>>>` prompt.

### Switching Models

To switch the active model, use the `/model` command:

```
>>> /model claude
Active model is now: claude (Claude Sonnet 4.5).
```

### Sending a Prompt

Simply type your prompt and press Enter:

```
>>> Create a python function for fibonacci.
```

The CLI will display the response from the currently active model.
