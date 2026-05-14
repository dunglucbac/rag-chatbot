import json


class ReceiptParser:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def parse(self, text: str) -> dict:
        """Parse receipt text into structured data using LLM"""
        prompt = f"""Parse the following receipt text into structured JSON.

            Extract:
            - merchant (string)
            - purchasedAt (ISO 8601 datetime)
            - total (number)
            - tax (number, if available)
            - currency (string)
            - lineItems (array of objects with name, quantity, unitPrice, totalPrice)

            Receipt text:
            {text}

            Return only valid JSON."""

        response = self.llm_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )

        raw = response.content[0].text
        raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(raw)
