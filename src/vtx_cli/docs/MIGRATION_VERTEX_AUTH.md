# Migration Guide: Vertex AI Authentication Improvements

**Version**: 0.17.0+  
**Date**: November 16, 2025

## Overview

This guide helps existing Gemini CLI users migrate to the improved Vertex AI authentication system that supports multiple authentication methods with automatic detection.

## What Changed?

### New Features

1. **Multiple Authentication Methods**: Support for ADC, service accounts, and API keys
2. **Automatic Detection**: The CLI automatically detects which authentication method to use
3. **Improved Error Messages**: Clear, actionable error messages with remediation steps
4. **Token Caching**: Automatic token refresh prevents session interruptions

### Backward Compatibility

**Good news**: All existing authentication configurations continue to work without changes. This update is fully backward compatible.

## Migration Scenarios

### Scenario 1: Currently Using API Key Only

**Before**:

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini
```

**After (No Change Required)**:

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini
```

**Optional Enhancement**: Add project and location for better error messages:

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
gemini
```

---

### Scenario 2: Want to Switch to ADC (Recommended for Development)

**Recommended if**:

- You're developing locally
- You use gcloud CLI
- You want password-less authentication

**Migration Steps**:

1. **Set up Application Default Credentials**:

   ```bash
   gcloud auth application-default login
   ```

2. **Set required environment variables**:

   ```bash
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   export GOOGLE_CLOUD_LOCATION="us-central1"
   ```

3. **Remove API key** (optional):

   ```bash
   unset GOOGLE_API_KEY
   unset GOOGLE_GENAI_USE_VERTEXAI
   ```

4. **Run Gemini CLI**:
   ```bash
   gemini
   ```

**Verification**: Check the startup logs for "Detected credential source: ADC_GCLOUD"

---

### Scenario 3: Want to Use Service Account (Recommended for CI/CD)

**Recommended if**:

- Running in CI/CD pipelines
- Running in containers
- Need reproducible authentication

**Migration Steps**:

1. **Create a service account** (if you don't have one):

   ```bash
   gcloud iam service-accounts create gemini-cli-sa \
     --display-name="Gemini CLI Service Account"
   ```

2. **Grant necessary permissions**:

   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:gemini-cli-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

3. **Download service account key**:

   ```bash
   gcloud iam service-accounts keys create ~/gemini-cli-sa-key.json \
     --iam-account=gemini-cli-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

4. **Set environment variables**:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/gemini-cli-sa-key.json"
   export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
   export GOOGLE_CLOUD_LOCATION="us-central1"
   ```

5. **Remove API key** (if switching from API key):

   ```bash
   unset GOOGLE_API_KEY
   ```

6. **Run Gemini CLI**:
   ```bash
   gemini
   ```

**Verification**: Check the startup logs for "Detected credential source: SERVICE_ACCOUNT_FILE"

---

### Scenario 4: CI/CD Pipeline Migration

**Before** (using API key in CI/CD):

```yaml
# GitHub Actions example
env:
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  GOOGLE_GENAI_USE_VERTEXAI: true
```

**After** (using service account - more secure):

```yaml
# GitHub Actions example
env:
  GOOGLE_APPLICATION_CREDENTIALS: ${{ github.workspace }}/sa-key.json
  GOOGLE_CLOUD_PROJECT: your-project-id
  GOOGLE_CLOUD_LOCATION: us-central1

steps:
  - name: Set up service account
    run: echo "${{ secrets.GCP_SA_KEY }}" > ${{ github.workspace }}/sa-key.json

  - name: Run Gemini CLI
    run: gemini -p "Review this PR"
```

---

## Environment Variables Reference

### Required for Vertex AI

| Variable                | Required? | Description            | Example          |
| ----------------------- | --------- | ---------------------- | ---------------- |
| `GOOGLE_CLOUD_PROJECT`  | Yes\*     | Your GCP project ID    | `my-project-123` |
| `GOOGLE_CLOUD_LOCATION` | Yes\*     | GCP region or 'global' | `us-central1`    |

\* Not required if using `GOOGLE_API_KEY` alone

### Authentication Method Selection (Priority Order)

| Variable                          | Priority    | Description                  |
| --------------------------------- | ----------- | ---------------------------- |
| `GOOGLE_API_KEY`                  | 1 (Highest) | Use API key authentication   |
| `GOOGLE_APPLICATION_CREDENTIALS`  | 2           | Path to service account JSON |
| ADC file (`~/.config/gcloud/...`) | 3           | gcloud ADC credentials       |
| Compute Metadata                  | 4 (Lowest)  | GCE/GKE default credentials  |

---

## Troubleshooting

### "Missing required environment variables"

**Error**:

```
When using Vertex AI, you must specify either:
• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION
• GOOGLE_API_KEY
```

**Solution**:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

---

### "Service account file not found"

**Error**:

```
Service account file not found: /path/to/sa.json
```

**Solutions**:

1. Check the file path is correct
2. Use absolute path instead of relative path
3. Verify file permissions (must be readable)

---

### "Permission denied accessing Vertex AI"

**Error**:

```
Authentication failed: Permission denied accessing Vertex AI
```

**Solution**: Grant the "Vertex AI User" role:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:your-sa@your-project.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

### "Vertex AI API not enabled"

**Error**:

```
Vertex AI API not enabled for project PROJECT_ID
```

**Solution**:

```bash
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
```

Or visit: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com

---

## Best Practices

### Development Environments

**Recommended**: Use ADC (Application Default Credentials)

- ✅ No credential files to manage
- ✅ Automatic credential refresh
- ✅ Uses your personal Google account permissions
- ✅ Easy to switch between projects

**Setup**:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="dev-project"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

---

### Production/CI/CD Environments

**Recommended**: Use Service Account JSON Key

- ✅ Explicit permissions (principle of least privilege)
- ✅ Reproducible across environments
- ✅ Can be rotated independently
- ✅ Works in restricted environments (containers, CI/CD)

**Setup**:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/to/sa-key.json"
export GOOGLE_CLOUD_PROJECT="prod-project"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

**Security Tips**:

- Never commit service account keys to version control
- Use secret management systems (GitHub Secrets, Cloud Secret Manager)
- Rotate keys regularly
- Set minimal IAM permissions

---

### Testing Environments

**Recommended**: Use API Key for simplicity

- ✅ Quick setup
- ✅ No gcloud CLI required
- ✅ Easy to share across team (if allowed by org policy)

**Setup**:

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
```

**Note**: Some organizations disable API key usage via org policies.

---

## Verification

To verify your authentication is working correctly:

1. **Enable debug logging**:

   ```bash
   export DEBUG=1
   gemini
   ```

2. **Check for authentication messages**:
   - Look for "Detected credential source: ..." in the logs
   - Verify "Access token cached" appears
   - Check "Authentication complete" message

3. **Test with a simple prompt**:
   ```bash
   gemini -p "Hello, test authentication"
   ```

---

## Rollback

If you encounter issues and need to revert to previous behavior:

1. **Reinstall previous version**:

   ```bash
   npm install -g @google/gemini-cli@0.16.0  # or your previous version
   ```

2. **Restore old environment variables**:
   ```bash
   export GOOGLE_API_KEY="your-api-key"
   export GOOGLE_GENAI_USE_VERTEXAI=true
   # Remove new variables if set
   unset GOOGLE_APPLICATION_CREDENTIALS
   unset GOOGLE_CLOUD_PROJECT
   unset GOOGLE_CLOUD_LOCATION
   ```

---

## Getting Help

If you encounter issues during migration:

1. **Check debug logs**: `export DEBUG=1 && gemini`
2. **Review error messages**: They now include specific remediation steps
3. **Consult documentation**: See [authentication.md](./get-started/authentication.md)
4. **Open an issue**: [GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)

---

## Summary

The Vertex AI authentication improvements provide:

- ✅ **No breaking changes**: All existing configurations work
- ✅ **More options**: Choose authentication method that fits your use case
- ✅ **Better errors**: Clear messages with actionable steps
- ✅ **Auto-detection**: System picks the right method automatically

You don't need to change anything, but we recommend migrating to ADC (development) or service accounts (production) for better security and ease of use.
