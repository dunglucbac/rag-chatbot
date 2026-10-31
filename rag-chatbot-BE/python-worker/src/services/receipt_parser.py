import json

from .utils import extract_json, get_text_from_response


class ReceiptParser:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def parse(self, text: str) -> dict:
        """Parse receipt text into structured data using LLM"""
        prompt = f"""Parse the following receipt text into structured JSON.

Extract these fields:
- merchant (string): the store or business name
- purchasedAt (UTC ISO 8601 datetime string, e.g. `2026-09-20T00:00:00Z`; use midnight UTC when only a date is available)
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

    def parse_payment(self, text: str) -> dict:
        """Extract the stable facts needed to review a bank transfer.

        Payment confirmations usually do not name the purchased item. That
        label is deliberately collected from the user later; this method only
        extracts facts visible in the uploaded document.
        """
        prompt = f"""Extract a bank-transfer/payment confirmation into structured JSON.

Return these fields only:
- merchant (string): recipient, beneficiary, or counterparty shown in the document
- purchasedAt (UTC ISO 8601 datetime string; use midnight UTC when only a date is shown)
- total (number): transferred amount, always positive
- currency (three-letter ISO 4217 currency code)
- confidence (number from 0 to 1): confidence in merchant, date, amount, and currency

Do not invent a purchased item, product, tax, or receipt line item. If a field
cannot be read reliably, use a low confidence value.

Payment text:
{text}

Reply with ONLY the JSON object, no explanation."""

        response = self.llm_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
            thinking={"type": "disabled"},
        )

        raw = get_text_from_response(response)
        return json.loads(extract_json(raw))
