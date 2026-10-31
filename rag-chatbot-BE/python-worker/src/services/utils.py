def extract_json(raw: str) -> str:
    """Extract the first JSON object from a string that may contain extra text."""
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        return raw[start : end + 1]
    return raw


def get_text_from_response(response) -> str:
    """Extract text from an LLM response, skipping any ThinkingBlock content."""
    for block in response.content:
        if block.type == "text":
            return block.text
    # Fallback: some models return thinking blocks without text when token-
    # budget is exhausted. Return the thinking text in that case.
    for block in response.content:
        if block.type == "thinking":
            return getattr(block, "thinking", "")
    return ""
