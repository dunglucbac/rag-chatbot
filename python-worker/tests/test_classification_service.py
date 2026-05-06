import pytest
from unittest.mock import Mock
from src.services.classification_service import ClassificationService


def test_can_classify_text_as_receipt():
    """Can classify extracted text as a receipt using LLM"""
    # Mock LLM client
    llm_client = Mock()
    llm_response = Mock()
    llm_response.content = '{"classification": "receipt", "confidence": 0.95}'
    llm_client.messages.create.return_value = llm_response

    service = ClassificationService(llm_client)
    result = service.classify("Starbucks Receipt\nTotal: $12.50\nDate: 2026-05-05")

    assert result["classification"] == "receipt"
    assert result["confidence"] == 0.95

    # Verify LLM was called with correct parameters
    llm_client.messages.create.assert_called_once()
    call_kwargs = llm_client.messages.create.call_args[1]
    assert call_kwargs["model"] == "claude-haiku-4-5-20251001"
