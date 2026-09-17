"""Adapter for the vendored DeepDoc + VietOCR pipeline."""

from collections.abc import Callable
from typing import Protocol

from src.extractors.document_extractor import DocumentExtractor


class DocumentExtractionPipeline(Protocol):
    """Internal seam for a warm, reusable document-extraction pipeline."""

    def extract(self, file_path: str, /) -> str: ...


PipelineFactory = Callable[[float], DocumentExtractionPipeline]


class DeepDocVietOcrExtractor(DocumentExtractor):
    """Extract document Markdown with DeepDoc layout analysis and VietOCR."""

    def __init__(
        self,
        layout_threshold: float = 0.5,
        pipeline_factory: PipelineFactory | None = None,
    ):
        if not 0 <= layout_threshold <= 1:
            raise ValueError("layout_threshold must be between 0 and 1")
        self._layout_threshold = layout_threshold
        self._pipeline_factory = pipeline_factory or self._create_pipeline
        self._pipeline: DocumentExtractionPipeline | None = None

    def extract(self, file_path: str, /) -> str:
        return self._get_pipeline().extract(file_path)

    def _get_pipeline(self) -> DocumentExtractionPipeline:
        if self._pipeline is None:
            self._pipeline = self._pipeline_factory(self._layout_threshold)
        return self._pipeline

    @staticmethod
    def _create_pipeline(layout_threshold: float) -> DocumentExtractionPipeline:
        # Import lazily so worker commands and tests that do not extract a
        # document do not initialize DeepDoc's OCR dependencies or models.
        from src.extractors.deepdoc_vietocr.full_pipeline import DeepDocPipeline

        return DeepDocPipeline(layout_threshold=layout_threshold)
