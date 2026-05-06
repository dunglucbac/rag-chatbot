---
glossary: true
---

# Domain Glossary

## Receipt
An itemized purchase record from a merchant (physical receipt, invoice, email confirmation). Contains:
- Merchant name
- Purchase date/time
- Line items with descriptions, quantities, prices
- Subtotal, tax, total
- Currency

Receipts are the primary source of spending data. They are parsed automatically and stored as structured data for analytics.

## Payment
A bank transfer screenshot showing money sent from the user's account to another account. Contains:
- Transfer date/time
- Amount
- Recipient account (may or may not indicate merchant)

**Why payments are different:** Payments lack line-item detail. A $50 transfer could be groceries, rent, or splitting a dinner bill. Payments require user clarification before becoming useful spending records.

**Payment workflow:**
1. User uploads payment screenshot
2. OCR extracts date, amount, recipient
3. Bot asks: "What did you buy with this $50 payment?"
4. User provides item descriptions (or ignores)
5. If user responds: create receipt record with provided items
6. If user ignores: payment is logged but not included in spending analytics

**Default assumption:** 1 item per payment unless user specifies otherwise.

## Document
Knowledge content uploaded for RAG retrieval (books, guides, articles, PDFs). Not spending-related. Chunked and embedded for the chatbot's knowledge base.

Examples: financial strategy books, investment guides, tax documentation.

## Ingestion Job
A processing task created when a file is uploaded. Tracks the file through classification, extraction, and storage. States: `pending` → `processing` → `needs_review` (optional) → `completed` or `failed`.
