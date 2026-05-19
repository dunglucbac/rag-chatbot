import pytest
from unittest.mock import Mock
from src.extractors.extractor_adapter import ExtractorAdapter
from src.extractors.base_extractor import BaseExtractor


def test_routes_to_configured_extractor_based_on_file_type():
    """Routes extraction to the correct extractor based on file_type config"""
    pdf_extractor = Mock(spec=BaseExtractor)
    pdf_extractor.extract.return_value = "PDF text"
    pdf_extractor.needs_ocr.return_value = False

    image_extractor = Mock(spec=BaseExtractor)
    image_extractor.extract.return_value = "Image text"

    adapter = ExtractorAdapter(
        extractors={"pdf": pdf_extractor, "tesseract": image_extractor},
        routing={"pdf": "pdf", "image": "tesseract"},
    )

    assert adapter.extract("/path/to/doc.pdf", "pdf") == "PDF text"
    assert adapter.extract("/path/to/img.jpg", "image") == "Image text"

    pdf_extractor.extract.assert_called_once_with("/path/to/doc.pdf")
    image_extractor.extract.assert_called_once_with("/path/to/img.jpg")


def test_returns_empty_string_when_file_type_not_in_routing():
    """Returns empty string when the file_type has no configured extractor"""
    pdf_extractor = Mock(spec=BaseExtractor)

    adapter = ExtractorAdapter(
        extractors={"pdf": pdf_extractor},
        routing={"pdf": "pdf"},  # no "image" key
    )

    result = adapter.extract("/path/to/img.jpg", "image")
    assert result == ""


def test_returns_empty_string_when_extractor_name_not_in_registry():
    """Returns empty string when routing points to a name not in the extractor registry"""
    adapter = ExtractorAdapter(
        extractors={"pdf": Mock(spec=BaseExtractor)},
        routing={"pdf": "missing_extractor"},
    )

    result = adapter.extract("/path/to/doc.pdf", "pdf")
    assert result == ""


def test_falls_back_to_image_extractor_when_pdf_text_is_sparse():
    """Uses image/OCR extractor as fallback when PDF yields sparse text (< 50 chars)"""
    pdf_extractor = Mock(spec=BaseExtractor)
    pdf_extractor.extract.return_value = "X"  # sparse text
    pdf_extractor.needs_ocr.return_value = True

    ocr_extractor = Mock(spec=BaseExtractor)
    ocr_extractor.extract.return_value = "OCR extracted text"

    adapter = ExtractorAdapter(
        extractors={"pdf": pdf_extractor, "tesseract": ocr_extractor},
        routing={"pdf": "pdf", "image": "tesseract"},
    )

    result = adapter.extract("/path/to/scanned.pdf", "pdf")
    assert result == "OCR extracted text"

    # Both extractors should have been called
    pdf_extractor.extract.assert_called_once_with("/path/to/scanned.pdf")
    ocr_extractor.extract.assert_called_once_with("/path/to/scanned.pdf")


def test_uses_pdf_result_directly_when_text_is_sufficient():
    """Uses PDF extraction result directly when text is sufficient (>= 50 chars)"""
    pdf_extractor = Mock(spec=BaseExtractor)
    pdf_text = "A" * 100
    pdf_extractor.extract.return_value = pdf_text
    pdf_extractor.needs_ocr.return_value = False

    ocr_extractor = Mock(spec=BaseExtractor)

    adapter = ExtractorAdapter(
        extractors={"pdf": pdf_extractor, "tesseract": ocr_extractor},
        routing={"pdf": "pdf", "image": "tesseract"},
    )

    result = adapter.extract("/path/to/text.pdf", "pdf")
    assert result == pdf_text

    # OCR extractor should NOT be called
    ocr_extractor.extract.assert_not_called()


def test_does_not_trigger_fallback_for_image_file_type():
    """Image extraction does not trigger OCR fallback (fallback only applies to PDF)"""
    image_extractor = Mock(spec=BaseExtractor)
    image_extractor.extract.return_value = "Short"  # < 50 chars, but it's an image

    adapter = ExtractorAdapter(
        extractors={"tesseract": image_extractor},
        routing={"image": "tesseract"},
    )

    result = adapter.extract("/path/to/receipt.jpg", "image")
    assert result == "Short"

    # needs_ocr should never be called for image types
    image_extractor.needs_ocr.assert_not_called()
