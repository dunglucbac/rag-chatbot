import base64
import io
import json

from PIL import Image

from .utils import extract_json, get_text_from_response


class ReceiptParser:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def parse(self, text: str) -> dict:
        """Parse receipt text into structured data using LLM"""
        prompt = f"""Parse the following receipt text into structured JSON.

Extract these fields:
- merchant (string): the store or business name
- purchasedAt (ISO 8601 datetime string)
- total (number): the stated total amount on the receipt
- tax (number or null): tax amount if shown
- currency (string): ISO 4217 currency code (e.g. USD, VND)
- lineItems (array of objects): each with name (string), quantity (number), unitPrice (number), totalPrice (number)

Before finalizing, cross-check the data:
1. Sum all lineItems[*].totalPrice
2. Compare this sum to the extracted total
3. If the difference is significant (more than a rounding error), there may be missing line items, OCR errors, or a discount. Try to account for the difference.
4. Set confidence (0-1) based on how well the data reconciles:
   - 0.9-1.0: line items sum matches total, all fields clear
   - 0.7-0.9: minor discrepancies but still reliable
   - 0.5-0.7: noticeable gaps but merchant/total identifiable
   - 0.3-0.5: significant uncertainty
   - 0.0-0.3: cannot reliably parse
5. If confidence < 0.9, include a discrepancy object with:
   - lineItemsSum (number): the sum of all line item totals
   - statedTotal (number): the total printed on the receipt
   - difference (number): statedTotal - lineItemsSum
   - likelyExplanation (string): brief explanation of what might explain the gap

If line items sum matches the total, set discrepancy to null.

Receipt text:
{text}

Reply with ONLY the JSON object, no explanation."""

        response = self.llm_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
            thinking={"type": "disabled"},
        )

        raw = get_text_from_response(response)
        return json.loads(extract_json(raw))

    def parse_with_vision(self, image_path: str, max_size: int = 2048) -> dict:
        """Parse a receipt by sending the image directly to a vision-capable LLM.

        Use this as a fallback when OCR-based parsing produces low confidence
        or discrepancies that cannot be resolved from the extracted text alone.
        """
        image = Image.open(image_path)

        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        if max(image.size) > max_size:
            w, h = image.size
            if w > h:
                new_w = max_size
                new_h = int(h * max_size / w)
            else:
                new_h = max_size
                new_w = int(w * max_size / h)
            image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG")
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")

        prompt = """You are a receipt processing expert. Extract structured data from this receipt image.

Return JSON with:
- merchant (string): the store or business name
- purchasedAt (ISO 8601 datetime string)
- total (number): the stated total amount on the receipt
- tax (number or null): tax amount if shown
- currency (string): ISO 4217 currency code (e.g. USD, VND)
- lineItems (array of objects): each with name (string), quantity (number), unitPrice (number), totalPrice (number)
- confidence (0-1): how reliable this extraction is
- discrepancy (object or null): if line items don't sum to total, include lineItemsSum, statedTotal, difference, likelyExplanation

Reply with ONLY the JSON object, no explanation."""

        response = self.llm_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": encoded,
                        },
                    },
                ],
            }],
            thinking={"type": "disabled"},
        )

        raw = get_text_from_response(response)
        return json.loads(extract_json(raw))
