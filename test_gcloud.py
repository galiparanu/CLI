import pytest
from google.cloud import aiplatform

def test_vertex_ai_initialization():
    """Tests that the Vertex AI client can be initialized and can list models."""
    try:
        # Initialize the Vertex AI client.
        # This will use the credentials set up by 'gcloud auth application-default login'
        aiplatform.init(project='protean-tooling-476420-i8', location='us-central1')

        # Get a list of available models.
        # This will fail if the API is not enabled or if the user does not have the correct permissions.
        models = aiplatform.Model.list()

        # The test is successful if we can get a list of models without any exceptions.
        assert models is not None

    except Exception as e:
        pytest.fail(f"Vertex AI initialization failed: {e}")
