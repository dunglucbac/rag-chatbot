import pytest
from unittest.mock import Mock
from src.services.receipt_parser import ReceiptParser


def test_can_parse_receipt_into_structured_data():
    """Can parse receipt text into structured line items using LLM"""
    # Mock LLM client
    llm_client = Mock()
    llm_response = Mock()
    llm_response.content = [Mock(text="""{
        "merchant": "Starbucks",
        "purchasedAt": "2026-05-05T10:30:00Z",
        "total": 12.50,
        "tax": 1.15,
        "currency": "USD",
        "lineItems": [
            {"name": "Latte", "quantity": 1, "unitPrice": 4.50, "totalPrice": 4.50},
            {"name": "Croissant", "quantity": 2, "unitPrice": 3.00, "totalPrice": 6.00}
        ]
    }""")]
    llm_client.messages.create.return_value = llm_response

    parser = ReceiptParser(llm_client)
    result = parser.parse(
        "Starbucks Receipt\nLatte $4.50\nCroissant x2 $6.00\nTotal: $12.50"
    )

    assert result["merchant"] == "Starbucks"
    assert result["total"] == 12.50
    assert len(result["lineItems"]) == 2
    assert result["lineItems"][0]["name"] == "Latte"

    # Verify LLM was called with Sonnet model
    llm_client.messages.create.assert_called_once()
    call_kwargs = llm_client.messages.create.call_args[1]
    assert call_kwargs["model"] == "claude-sonnet-4-6"
