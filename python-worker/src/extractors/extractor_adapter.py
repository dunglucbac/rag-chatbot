from src.extractors.base_extractor import BaseExtractor


class ExtractorAdapter:
    def __init__(self, extractors: dict[str, BaseExtractor], routing: dict[str, str]):
        self._extractors = extractors
        self._routing = routing

    def extract(self, file_path: str, file_type: str) -> str:
        extractor_name = self._routing.get(file_type)
        if not extractor_name:
            return ""

        extractor = self._extractors.get(extractor_name)
        if not extractor:
            return ""

        text = extractor.extract(file_path)

        # Docling handles text extraction and OCR in one layout-aware pass.
        # Avoid converting the same PDF a second time when its output is
        # short, while retaining the legacy fallback behavior for extractors
        # that do not own their OCR path.
        if (
            file_type == "pdf"
            and extractor.needs_ocr(text)
            and not getattr(extractor, "handles_ocr", False)
        ):
            ocr_name = self._routing.get("image")
            ocr = self._extractors.get(ocr_name) if ocr_name else None
            if ocr:
                text = ocr.extract(file_path)

        return text
