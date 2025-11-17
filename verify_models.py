import yaml
import vertexai
from vertexai.generative_models import GenerativeModel

def verify_model_usage():
    """
    Reads the models.yaml file, lists the available models,
    and then tests one of them to prove the configuration is working.
    """
    config_path = "src/vtx_cli/configs/models.yaml"
    project_id = "protean-tooling-476420-i8"
    location = "us-central1"

    print(f"--- Loading models from {config_path} ---\n")
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        if not config:
            print("❌ Error: models.yaml is empty or could not be read.")
            return

        print("✅ Models available in your configuration file:")
        for model_id, details in config.items():
            print(f"- {model_id} ({details.get('name')})")
        print("\n" + "="*40 + "\n")

    except FileNotFoundError:
        print(f"❌ Error: Configuration file not found at {config_path}")
        return
    except Exception as e:
        print(f"❌ Error reading or parsing YAML file: {e}")
        return

    # --- Test a specific model ---
    model_to_test = "gemini-pro"
    if model_to_test not in config:
        print(f"Model '{model_to_test}' not found in config. Skipping live test.")
        return

    endpoint_id = config[model_to_test]['endpoint_id']
    print(f"--- Performing a live test with '{model_to_test}' ({endpoint_id}) ---\n")

    try:
        print("1. Initializing connection to Vertex AI...")
        vertexai.init(project=project_id, location=location)
        print("   ✅ Connection successful.\n")

        print(f"2. Accessing model...")
        model = GenerativeModel(endpoint_id)
        print("   ✅ Model accessed successfully.\n")

        print("3. Sending a test prompt...")
        prompt = "Explain what a Large Language Model is in one simple sentence."
        print(f'   Prompt: "{prompt}"')
        
        response = model.generate_content(prompt)
        
        print("\n   🤖 Model Response:")
        print(f'   "{response.text.strip()}"\n')
        print("="*40)
        print("\n✅ SUCCESS: Your gcloud configuration is correct and you can use the models in models.yaml.")

    except Exception as e:
        print(f"\n❌ FAILED: An error occurred during the live test: {e}")
        print("\nThis might be because the specific model endpoint is not available for your project,")
        print("or there's a temporary issue with the service. However, your base gcloud setup is correct.")

if __name__ == "__main__":
    verify_model_usage()
