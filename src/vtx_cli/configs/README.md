# Model Configuration Guide

This directory contains configuration files for AI models available through the Vertex AI CLI.

## models.yaml

The `models.yaml` file defines all available models and their configuration parameters.

### Configuration Fields

#### Required Fields

- **`name`**: Human-readable name for the model
- **`endpoint_id`**: The model endpoint identifier used by Vertex AI
- **`adapter`**: The adapter type (`gemini` or `claude`)
- **`region`**: GCP region where the model is hosted (e.g., `us-central1`, `us-south1`, `global`)
- **`api_type`**: API type - `vertex` (default) or `openapi` for OpenAPI-compatible endpoints
- **`auth_method`**: Authentication method (see below)

#### Optional Fields

- **`endpoint`**: Custom endpoint domain (optional, uses region-based default if not specified)

### Authentication Methods (`auth_method`)

The `auth_method` field specifies how the CLI authenticates to the model. Supported values:

#### `bearer_token`

Uses bearer token authentication via OpenAPI endpoints. The token is obtained automatically using Google Application Default Credentials (ADC).

**Requirements:**
- Google Cloud SDK (`gcloud`) installed and configured
- Application Default Credentials set up: `gcloud auth application-default login`
- Appropriate IAM permissions for Vertex AI

**Example:**
```yaml
deepseek-v3:
  name: "DeepSeek V3.1"
  endpoint_id: "deepseek-ai/deepseek-v3.1-maas"
  adapter: "gemini"
  region: "us-south1"
  endpoint: "us-south1-aiplatform.googleapis.com"
  api_type: "openapi"
  auth_method: "bearer_token"
```

**Supported Models:**
- DeepSeek v3.1
- DeepSeek R1 0528
- Qwen Coder
- Kimi K2
- Claude Opus 4.1
- Gemini 1.0 Pro
- Llama 3 8B
- Gemma 2 9B
- Mistral 7B

#### `claude_sdk`

Uses the Anthropic Vertex SDK for authentication. Requires Python and the `anthropic[vertex]` package.

**Requirements:**
- Python 3.7+ installed and accessible
- Anthropic Vertex SDK: `pip install anthropic[vertex]`
- Google Cloud credentials configured (ADC)
- `GOOGLE_CLOUD_PROJECT` environment variable set

**Example:**
```yaml
claude-sonnet:
  name: "Claude Sonnet 4.5"
  endpoint_id: "claude-sonnet-4-5@20250929"
  adapter: "claude"
  region: "global"
  api_type: "vertex"
  auth_method: "claude_sdk"
```

**Supported Models:**
- Claude Sonnet 4.5

**Installation:**
```bash
pip install anthropic[vertex]
```

#### `gemini_sdk`

Uses the Google Gen AI SDK for authentication with Vertex AI mode. Requires Python and the `google-genai` package.

**Requirements:**
- Python 3.7+ installed and accessible
- Google Gen AI SDK: `pip install google-generativeai vertexai`
- Google Cloud credentials configured (ADC)
- `GOOGLE_CLOUD_PROJECT` environment variable set

**Example:**
```yaml
gemini:
  name: "Gemini 2.5 Pro"
  endpoint_id: "gemini-2.5-pro"
  adapter: "gemini"
  region: "global"
  api_type: "vertex"
  auth_method: "gemini_sdk"
```

**Supported Models:**
- Gemini 2.5 Pro

**Installation:**
```bash
pip install google-generativeai vertexai
```

### Region Configuration

Different models may be available in different regions:

- **`us-central1`**: Default region for many Vertex AI models
- **`us-south1`**: Used for DeepSeek, Qwen models
- **`us-east5`**: Used for Claude Opus
- **`global`**: Used for Claude Sonnet, Gemini 2.5 Pro, Kimi K2

The `endpoint` field can be used to specify a custom endpoint domain. If not specified, the endpoint is constructed from the region.

### Environment Variables

The following environment variables can be used to configure authentication:

- **`GOOGLE_CLOUD_PROJECT`**: Your GCP project ID (required for SDK-based auth)
- **`PYTHON_PATH`**: Path to Python executable (default: `python3`)

### Adding a New Model

To add a new model:

1. Determine the correct `endpoint_id` from Vertex AI documentation
2. Identify the appropriate `region` and `endpoint` (if needed)
3. Choose the correct `auth_method` based on the model type
4. Add the configuration to `models.yaml`:

```yaml
model-alias:
  name: "Model Name"
  endpoint_id: "model/endpoint-id"
  adapter: "gemini"  # or "claude"
  region: "us-central1"
  api_type: "vertex"  # or "openapi"
  auth_method: "bearer_token"  # or "claude_sdk" or "gemini_sdk"
```

### Troubleshooting

#### Bearer Token Authentication Issues

- **Error: "Missing credentials"**
  - Run: `gcloud auth application-default login`
  - Verify: `gcloud auth list`

- **Error: "Invalid credentials"**
  - Refresh credentials: `gcloud auth application-default login`
  - Check IAM permissions for Vertex AI

#### SDK Authentication Issues

- **Error: "Missing dependency"**
  - Install required Python packages (see installation instructions above)
  - Verify Python is accessible: `python3 --version`
  - Check `PYTHON_PATH` environment variable if using custom Python path

- **Error: "GOOGLE_CLOUD_PROJECT not set"**
  - Set environment variable: `export GOOGLE_CLOUD_PROJECT=your-project-id`
  - Or provide project ID when calling the CLI

### Performance Targets

- **Bearer Token Authentication**: < 5 seconds
- **SDK Authentication**: < 10 seconds (includes dependency validation)

Performance warnings are logged if authentication exceeds these targets.
