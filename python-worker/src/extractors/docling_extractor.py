import logging
from typing import Protocol

from docling.datamodel.base_models import ConversionStatus
from docling.datamodel.document import ConversionResult

from src.extractors.document_extractor import DocumentExtractor

logger = logging.getLogger(__name__)


class DocumentConverterProtocol(Protocol):
    """The Docling converter contract used by this extractor."""

    def convert(self, source: str, /) -> ConversionResult: ...


class DoclingExtractor(DocumentExtractor):
    """Extract text and layout from PDFs and images with Docling.

    Docling owns both the direct-PDF extraction and OCR paths. This means a
    scanned PDF does not need to be rasterized and sent through a separate
    image extractor, while image receipts use the same layout-aware pipeline.
    """

    def __init__(
        self,
        artifacts_path: str | None = None,
        converter: DocumentConverterProtocol | None = None,
    ):
        self.artifacts_path = artifacts_path
        self._converter = converter

    @property
    def converter(self) -> DocumentConverterProtocol:
        if self._converter is None:
            self._converter = self._build_converter()
        return self._converter

    def extract(self, file_path: str) -> str:
        """Convert a PDF or image and return its Docling TextItems in order."""
        logger.info("Extracting document with Docling: %s", file_path)
        result: ConversionResult = self.converter.convert(file_path)
        if result.status != ConversionStatus.SUCCESS:
            error_details = "; ".join(error.error_message for error in result.errors)
            message = (
                "Docling conversion did not complete successfully "
                f"for {file_path}: status={result.status.value}"
            )
            if error_details:
                message = f"{message}; errors={error_details}"
            raise RuntimeError(message)

        return "\n\n".join(
            text_item.text.strip()
            for text_item in result.document.texts
            if text_item.text.strip()
        )

    def _build_converter(self) -> DocumentConverterProtocol:
        # Keep Docling imports lazy so unit tests and commands that do not
        # process documents can still import the worker without initializing
        # OCR models.
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import (
            OcrMode,
            PdfPipelineOptions,
            RapidOcrOptions,
        )
        from docling.document_converter import (
            DocumentConverter,
            ImageFormatOption,
            PdfFormatOption,
        )

        def pipeline_options(ocr_mode: OcrMode):
            options = PdfPipelineOptions()
            options.do_ocr = True
            options.do_table_structure = True
            if self.artifacts_path:
                options.artifacts_path = self.artifacts_path
            options.ocr_options = RapidOcrOptions(
                backend="torch",
                # RapidOCR accepts one recognition language per conversion.
                lang=["vi"],
                mode=ocr_mode,
            )
            return options

        return DocumentConverter(
            allowed_formats=[InputFormat.PDF, InputFormat.IMAGE],
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=pipeline_options(OcrMode.PDF_AWARE_LAYOUT_REGIONS)
                ),
                InputFormat.IMAGE: ImageFormatOption(
                    pipeline_options=pipeline_options(OcrMode.FULL_PAGE)
                ),
            },
        )
