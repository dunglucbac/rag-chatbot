import json

from .utils import extract_json, get_text_from_response


class ClassificationService:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def classify(self, text: str) -> dict:
        """Classify text as receipt, payment, or document using LLM"""
        prompt = f"""Classify the following text as either "receipt", "payment", or "document".
Return JSON with classification and confidence (0-1).

Text:
{text}

Response format: {{"classification": "receipt|payment|document", "confidence": 0.95}}

Reply with ONLY the JSON object, no explanation."""

        response = self.llm_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}],
            thinking={"type": "disabled"},
        )

        raw = get_text_from_response(response)
        return json.loads(extract_json(raw))
