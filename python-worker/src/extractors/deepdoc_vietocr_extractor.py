"""Adapter for the vendored DeepDoc + VietOCR pipeline."""

from collections.abc import Callable

from src.extractors.document_extractor import DocumentExtractor

ExtractionPipeline = Callable[[str, float], str]


class DeepDocVietOcrExtractor(DocumentExtractor):
    """Extract document Markdown with DeepDoc layout analysis and VietOCR."""

    def __init__(
        self,
        layout_threshold: float = 0.5,
        pipeline: ExtractionPipeline | None = None,
    ):
        if not 0 <= layout_threshold <= 1:
            raise ValueError("layout_threshold must be between 0 and 1")
        self._layout_threshold = layout_threshold
        self._pipeline = pipeline

    def extract(self, file_path: str, /) -> str:
        pipeline = self._pipeline or self._load_pipeline()
        return pipeline(file_path, self._layout_threshold)

    @staticmethod
    def _load_pipeline() -> ExtractionPipeline:
        # Import lazily so worker commands and tests that do not extract a
        # document do not initialize DeepDoc's OCR dependencies or models.
        from src.extractors.deepdoc_vietocr.full_pipeline import extract_document

        return extract_document
