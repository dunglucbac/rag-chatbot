def extract_json(raw: str) -> str:
    """Extract the first JSON object from a string that may contain extra text."""
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        return raw[start : end + 1]
    return raw
