import pytest
from pathlib import Path
from src.extractors.pdf_extractor import PDFExtractor


def test_can_extract_text_from_pdf(tmp_path):
    """Can extract text from a text-based PDF file"""
    # Create a simple PDF for testing
    pdf_path = tmp_path / "test.pdf"

    # For now, we'll use a real PDF library to create a test file
    # In a real scenario, you'd have a fixture PDF file
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(pdf_path))
    c.drawString(100, 750, "Hello World")
    c.drawString(100, 730, "This is a test PDF")
    c.save()

    extractor = PDFExtractor()
    text = extractor.extract(str(pdf_path))

    assert "Hello World" in text
    assert "This is a test PDF" in text


def test_detects_when_pdf_needs_ocr(tmp_path):
    """Detects when extracted text is too short and OCR is needed"""
    # Create a PDF with minimal text (simulating scanned image)
    pdf_path = tmp_path / "scanned.pdf"

    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(pdf_path))
    c.drawString(100, 750, "X")  # Only 1 character
    c.save()

    extractor = PDFExtractor()
    text = extractor.extract(str(pdf_path))
    needs_ocr = extractor.needs_ocr(text)

    assert needs_ocr is True
    assert len(text) < 50
