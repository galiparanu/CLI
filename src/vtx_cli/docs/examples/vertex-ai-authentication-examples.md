# Vertex AI Authentication Examples

This guide provides practical, copy-paste ready examples for each Vertex AI authentication method.

## Table of Contents

- [Local Development with ADC](#local-development-with-adc)
- [CI/CD with Service Account](#cicd-with-service-account)
- [Docker Container Setup](#docker-container-setup)
- [Multiple Environments](#multiple-environments)
- [Kubernetes Deployment](#kubernetes-deployment)

---

## Local Development with ADC

**Scenario**: You're developing locally and want seamless authentication without managing credential files.

### One-Time Setup

```bash
# Install gcloud CLI (if not already installed)
# Visit: https://cloud.google.com/sdk/docs/install

# Authenticate with your Google account
gcloud auth application-default login

# Set your default project
gcloud config set project YOUR_PROJECT_ID
```

### Daily Usage

Create a `.env` file in your project or `~/.gemini/.env`:

```bash
# .gemini/.env or project-root/.env
GOOGLE_CLOUD_PROJECT=my-dev-project
GOOGLE_CLOUD_LOCATION=us-central1
```

Then just run:

```bash
gemini
```

### Verification

```bash
# Enable debug logging to see authentication details
DEBUG=1 gemini -p "test authentication"
```

Expected output:

```
[DEBUG] Detected credential source: ADC_GCLOUD
[DEBUG] Access token cached, expires in 59 minutes
```

---

## CI/CD with Service Account

### GitHub Actions

**Complete Example**:

```yaml
# .github/workflows/gemini-pr-review.yml
name: Gemini PR Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install Gemini CLI
        run: npm install -g @google/gemini-cli

      - name: Setup Service Account
        run: |
          echo "${{ secrets.GCP_SA_KEY }}" > ${{ github.workspace }}/sa-key.json
          chmod 600 ${{ github.workspace }}/sa-key.json

      - name: Review PR with Gemini
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ github.workspace }}/sa-key.json
          GOOGLE_CLOUD_PROJECT: ${{ secrets.GCP_PROJECT_ID }}
          GOOGLE_CLOUD_LOCATION: us-central1
        run: |
          gemini -p "Review this pull request and provide feedback" \
            --output-format json > review.json

      - name: Cleanup
        if: always()
        run: rm -f ${{ github.workspace }}/sa-key.json
```

**Secrets to Configure** (in GitHub Repository Settings):

- `GCP_SA_KEY`: Your service account JSON key file contents
- `GCP_PROJECT_ID`: Your Google Cloud project ID

### GitLab CI

```yaml
# .gitlab-ci.yml
variables:
  GOOGLE_CLOUD_PROJECT: "your-project-id"
  GOOGLE_CLOUD_LOCATION: "us-central1"

gemini_review:
  image: node:20
  before_script:
    - npm install -g @google/gemini-cli
    - echo "$GCP_SA_KEY" > /tmp/sa-key.json
    - chmod 600 /tmp/sa-key.json
    - export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa-key.json
  script:
    - gemini -p "Analyze this merge request"
  after_script:
    - rm -f /tmp/sa-key.json
  only:
    - merge_requests
```

**CI/CD Variables to Set**:

- `GCP_SA_KEY` (File or Variable): Service account JSON key

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        GOOGLE_APPLICATION_CREDENTIALS = credentials('gemini-sa-key-file')
        GOOGLE_CLOUD_PROJECT = 'your-project-id'
        GOOGLE_CLOUD_LOCATION = 'us-central1'
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @google/gemini-cli'
            }
        }

        stage('Review') {
            steps {
                sh 'gemini -p "Review changes in this build"'
            }
        }
    }
}
```

**Jenkins Credentials**:

- ID: `gemini-sa-key-file`
- Type: Secret file
- File: Upload your service account JSON key

---

## Docker Container Setup

### Option 1: Environment Variables

```dockerfile
# Dockerfile
FROM node:20-alpine

# Install Gemini CLI
RUN npm install -g @google/gemini-cli

# Set working directory
WORKDIR /app

# Copy your application
COPY . .

# Set environment variables (use build args for flexibility)
ARG GOOGLE_CLOUD_PROJECT
ARG GOOGLE_CLOUD_LOCATION
ENV GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}
ENV GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION}

ENTRYPOINT ["gemini"]
```

**Build and Run**:

```bash
# Build image
docker build \
  --build-arg GOOGLE_CLOUD_PROJECT=my-project \
  --build-arg GOOGLE_CLOUD_LOCATION=us-central1 \
  -t gemini-cli .

# Run with mounted service account key
docker run \
  -v $HOME/sa-key.json:/tmp/sa-key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa-key.json \
  gemini-cli -p "Hello from Docker"
```

### Option 2: Using .dockerignore and Mounted Volumes

```bash
# .dockerignore
# Ensure credentials are never built into image
*.json
.env
.env.*
credentials/
```

**Docker Compose**:

```yaml
# docker-compose.yml
version: "3.8"

services:
  gemini-cli:
    build: .
    volumes:
      - ./code:/app
      - ~/.gemini-sa-key.json:/tmp/sa-key.json:ro
    environment:
      - GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa-key.json
      - GOOGLE_CLOUD_PROJECT=my-project
      - GOOGLE_CLOUD_LOCATION=us-central1
    command: ["-p", "Analyze this codebase"]
```

Run:

```bash
docker-compose run gemini-cli
```

---

## Multiple Environments

### Setup for Dev/Staging/Prod

Create environment-specific configuration files:

**~/.gemini/.env.dev**:

```bash
GOOGLE_CLOUD_PROJECT=my-dev-project
GOOGLE_CLOUD_LOCATION=us-central1
# Use ADC for development
```

**~/.gemini/.env.staging**:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/staging-sa.json
GOOGLE_CLOUD_PROJECT=my-staging-project
GOOGLE_CLOUD_LOCATION=us-central1
```

**~/.gemini/.env.prod**:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa.json
GOOGLE_CLOUD_PROJECT=my-prod-project
GOOGLE_CLOUD_LOCATION=us-east1
```

**Helper Script** (`~/.local/bin/gemini-env`):

```bash
#!/bin/bash
# Usage: gemini-env dev|staging|prod [gemini args...]

ENV=$1
shift

if [ -f "$HOME/.gemini/.env.$ENV" ]; then
    set -a
    source "$HOME/.gemini/.env.$ENV"
    set +a
    gemini "$@"
else
    echo "Environment file not found: $HOME/.gemini/.env.$ENV"
    exit 1
fi
```

Make executable and use:

```bash
chmod +x ~/.local/bin/gemini-env

# Use in different environments
gemini-env dev -p "test in dev"
gemini-env staging -p "verify in staging"
gemini-env prod -p "deploy to production"
```

---

## Kubernetes Deployment

### Using Workload Identity (Recommended)

```yaml
# gemini-cli-deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gemini-cli-sa
  annotations:
    iam.gke.io/gcp-service-account: gemini-cli@PROJECT_ID.iam.gserviceaccount.com
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: gemini-config
data:
  GOOGLE_CLOUD_PROJECT: "your-project-id"
  GOOGLE_CLOUD_LOCATION: "us-central1"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gemini-cli
spec:
  replicas: 1
  selector:
    matchLabels:
      app: gemini-cli
  template:
    metadata:
      labels:
        app: gemini-cli
    spec:
      serviceAccountName: gemini-cli-sa
      containers:
        - name: gemini
          image: node:20
          command: ["/bin/sh", "-c"]
          args:
            - npm install -g @google/gemini-cli && gemini -p "Running in Kubernetes"
          envFrom:
            - configMapRef:
                name: gemini-config
```

**Setup Workload Identity**:

```bash
# Create GCP service account
gcloud iam service-accounts create gemini-cli \
  --project=PROJECT_ID

# Grant Vertex AI User role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:gemini-cli@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Bind Kubernetes SA to GCP SA
gcloud iam service-accounts add-iam-policy-binding \
  gemini-cli@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:PROJECT_ID.svc.id.goog[default/gemini-cli-sa]"

# Deploy
kubectl apply -f gemini-cli-deployment.yaml
```

### Using Kubernetes Secret

```bash
# Create secret from service account file
kubectl create secret generic gemini-sa-key \
  --from-file=key.json=/path/to/sa-key.json
```

```yaml
# gemini-cli-deployment-secret.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gemini-cli
spec:
  replicas: 1
  selector:
    matchLabels:
      app: gemini-cli
  template:
    metadata:
      labels:
        app: gemini-cli
    spec:
      containers:
        - name: gemini
          image: node:20
          command: ["/bin/sh", "-c"]
          args:
            - npm install -g @google/gemini-cli && gemini -p "Hello from K8s"
          env:
            - name: GOOGLE_APPLICATION_CREDENTIALS
              value: /var/secrets/google/key.json
            - name: GOOGLE_CLOUD_PROJECT
              value: your-project-id
            - name: GOOGLE_CLOUD_LOCATION
              value: us-central1
          volumeMounts:
            - name: sa-key
              mountPath: /var/secrets/google
              readOnly: true
      volumes:
        - name: sa-key
          secret:
            secretName: gemini-sa-key
```

Deploy:

```bash
kubectl apply -f gemini-cli-deployment-secret.yaml
```

---

## Testing Your Setup

### Quick Verification Script

Save as `test-auth.sh`:

```bash
#!/bin/bash
set -e

echo "Testing Vertex AI Authentication..."
echo "====================================="
echo ""

# Test 1: Check environment variables
echo "1. Checking environment variables..."
if [ -n "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "   ✓ GOOGLE_CLOUD_PROJECT: $GOOGLE_CLOUD_PROJECT"
else
    echo "   ✗ GOOGLE_CLOUD_PROJECT not set"
fi

if [ -n "$GOOGLE_CLOUD_LOCATION" ]; then
    echo "   ✓ GOOGLE_CLOUD_LOCATION: $GOOGLE_CLOUD_LOCATION"
else
    echo "   ✗ GOOGLE_CLOUD_LOCATION not set"
fi

# Test 2: Check credential source
echo ""
echo "2. Checking credential source..."
if [ -n "$GOOGLE_API_KEY" ]; then
    echo "   → Using API Key"
elif [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    if [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        echo "   ✓ Using Service Account: $GOOGLE_APPLICATION_CREDENTIALS"
    else
        echo "   ✗ Service account file not found: $GOOGLE_APPLICATION_CREDENTIALS"
    fi
elif [ -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
    echo "   ✓ Using ADC (gcloud)"
else
    echo "   ✗ No credentials found"
fi

# Test 3: Run Gemini CLI
echo ""
echo "3. Testing Gemini CLI authentication..."
DEBUG=1 gemini -p "test" 2>&1 | grep -i "credential\|auth\|token" | head -5

echo ""
echo "====================================="
echo "Test complete!"
```

Run:

```bash
chmod +x test-auth.sh
./test-auth.sh
```

---

## Common Patterns

### Pattern 1: Fallback Authentication

Try ADC first, fall back to service account:

```bash
#!/bin/bash

if [ -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
    echo "Using ADC"
    # ADC variables already set
else
    echo "Using Service Account"
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json"
fi

export GOOGLE_CLOUD_PROJECT="my-project"
export GOOGLE_CLOUD_LOCATION="us-central1"

gemini "$@"
```

### Pattern 2: Temporary Credentials

For one-off tasks:

```bash
# Create temporary credentials, use, then cleanup
TEMP_SA_KEY=$(mktemp)
trap "rm -f $TEMP_SA_KEY" EXIT

echo "$GCP_SA_KEY_CONTENTS" > "$TEMP_SA_KEY"
chmod 600 "$TEMP_SA_KEY"

GOOGLE_APPLICATION_CREDENTIALS="$TEMP_SA_KEY" \
GOOGLE_CLOUD_PROJECT="my-project" \
GOOGLE_CLOUD_LOCATION="us-central1" \
gemini -p "temporary task"
```

### Pattern 3: Project Switching

Quickly switch between projects:

```bash
# ~/.bashrc or ~/.zshrc

gemini-project() {
    export GOOGLE_CLOUD_PROJECT="$1"
    export GOOGLE_CLOUD_LOCATION="${2:-us-central1}"
    echo "Switched to project: $GOOGLE_CLOUD_PROJECT ($GOOGLE_CLOUD_LOCATION)"
}

# Usage
gemini-project my-dev-project
gemini -p "test"

gemini-project my-prod-project us-east1
gemini -p "production query"
```

---

## Security Best Practices

1. **Never commit credentials**:

   ```gitignore
   # .gitignore
   *.json
   *-key.json
   .env
   .env.*
   !.env.example
   ```

2. **Use secret managers**:
   - GitHub: Repository Secrets
   - GitLab: CI/CD Variables (masked)
   - Jenkins: Credentials Plugin
   - GCP: Secret Manager

3. **Rotate service account keys regularly**:

   ```bash
   # Delete old key
   gcloud iam service-accounts keys delete KEY_ID \
     --iam-account=SA_EMAIL

   # Create new key
   gcloud iam service-accounts keys create new-key.json \
     --iam-account=SA_EMAIL
   ```

4. **Use minimal IAM permissions**:
   - Only grant `roles/aiplatform.user`
   - Avoid `roles/owner` or `roles/editor`

5. **Set restrictive file permissions**:
   ```bash
   chmod 600 service-account-key.json
   ```

---

## Additional Resources

- [Vertex AI Authentication Guide](../get-started/authentication.md)
- [Migration Guide](../MIGRATION_VERTEX_AUTH.md)
- [Troubleshooting](../troubleshooting.md)
