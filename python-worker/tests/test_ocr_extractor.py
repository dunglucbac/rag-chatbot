import pytest
from unittest.mock import Mock, patch, MagicMock
from src.extractors.ocr_extractor import OCRExtractor


def test_can_extract_text_from_image_using_ocr(tmp_path):
    """Can extract text from an image using Tesseract OCR"""
    image_path = tmp_path / "receipt.jpg"
    image_path.write_text("dummy")

    # Mock both PIL.Image and pytesseract
    with patch('src.extractors.ocr_extractor.Image') as mock_image, \
         patch('src.extractors.ocr_extractor.pytesseract') as mock_pytesseract:

        mock_img = MagicMock()
        mock_image.open.return_value = mock_img
        mock_pytesseract.image_to_string.return_value = "Starbucks\nTotal: $12.50"

        extractor = OCRExtractor()
        text = extractor.extract(str(image_path))

        assert "Starbucks" in text
        assert "$12.50" in text
        mock_image.open.assert_called_once_with(str(image_path))
        mock_pytesseract.image_to_string.assert_called_once_with(mock_img)
