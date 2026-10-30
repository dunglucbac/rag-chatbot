from unittest.mock import Mock, patch
from src.services.receipt_parser import ReceiptParser


def _mock_llm_response(json_text: str):
    """Create a mock LLM client that returns the given JSON text."""
    llm_client = Mock()
    llm_response = Mock()
    llm_response.content = [Mock(type="text", text=json_text)]
    llm_client.messages.create.return_value = llm_response
    return llm_client


def test_can_parse_receipt_into_structured_data():
    """Can parse receipt text into structured line items using LLM"""
    mock_json = """{
        "merchant": "Starbucks",
        "purchasedAt": "2026-05-05T10:30:00Z",
        "total": 12.50,
        "tax": 1.15,
        "currency": "USD",
        "lineItems": [
            {"name": "Latte", "quantity": 1, "unitPrice": 4.50, "totalPrice": 4.50},
            {"name": "Croissant", "quantity": 2, "unitPrice": 3.00, "totalPrice": 6.00}
        ],
        "confidence": 0.95,
        "discrepancy": null
    }"""

    with patch(
        "src.services.receipt_parser.get_text_from_response", return_value=mock_json
    ):
        parser = ReceiptParser(Mock())
        result = parser.parse(
            "Starbucks Receipt\nLatte $4.50\nCroissant x2 $6.00\nTotal: $12.50"
        )

    assert result["merchant"] == "Starbucks"
    assert result["total"] == 12.50
    assert len(result["lineItems"]) == 2
    assert result["lineItems"][0]["name"] == "Latte"
    assert "confidence" in result
    assert "discrepancy" in result


def test_prompt_includes_cross_validation_instructions():
    """Prompt instructs the LLM to cross-check line item totals against stated total"""
    mock_json = """{
        "merchant": "Test Store",
        "purchasedAt": "2026-05-05T10:00:00Z",
        "total": 50.00,
        "tax": null,
        "currency": "USD",
        "lineItems": [
            {"name": "Item A", "quantity": 1, "unitPrice": 20.00, "totalPrice": 20.00}
        ],
        "confidence": 0.5,
        "discrepancy": {
            "lineItemsSum": 20.00,
            "statedTotal": 50.00,
            "difference": 30.00,
            "likelyExplanation": "Missing line items or OCR errors"
        }
    }"""

    llm_client = Mock()
    llm_response = Mock()
    llm_response.content = [Mock()]
    llm_client.messages.create.return_value = llm_response

    with patch(
        "src.services.receipt_parser.get_text_from_response", return_value=mock_json
    ):
        parser = ReceiptParser(llm_client)
        result = parser.parse("Test Store\nItem A $20.00\nTotal: $50.00")

    assert result["confidence"] == 0.5
    assert result["discrepancy"] is not None
    assert result["discrepancy"]["difference"] == 30.00

    # Verify prompt asks for cross-checking
    prompt_text = llm_client.messages.create.call_args[1]["messages"][0]["content"]
    assert "sum" in prompt_text.lower()
    assert "discrepancy" in prompt_text.lower()
    assert "confidence" in prompt_text.lower()


def test_uncertain_receipt_uses_one_text_only_llm_request():
    llm_client = _mock_llm_response(
        '{"merchant": "Store", "total": 50, "confidence": 0.5}'
    )
    parser = ReceiptParser(llm_client)

    receipt = parser.parse("Store\nTotal: 50")

    assert receipt["confidence"] == 0.5
    llm_client.messages.create.assert_called_once()
    messages = llm_client.messages.create.call_args.kwargs["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert isinstance(messages[0]["content"], str)
    assert "Store\nTotal: 50" in messages[0]["content"]
