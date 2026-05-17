import pytest
import numpy as np
from unittest.mock import patch
from src.extractors.ocr_extractor import OCRExtractor


def test_uses_psm_6_config_for_receipt_layout(tmp_path):
    """Tesseract is configured with --psm 6 for uniform block of text"""
    image_path = tmp_path / "receipt.jpg"
    image_path.write_text("dummy")

    dummy_image = np.zeros((400, 300, 3), dtype=np.uint8)

    with patch("src.extractors.ocr_extractor.cv2") as mock_cv2, patch(
        "src.extractors.ocr_extractor.pytesseract"
    ) as mock_pytesseract:

        mock_cv2.imread.return_value = dummy_image
        mock_pytesseract.image_to_string.return_value = "Starbucks\nTotal: $12.50"

        extractor = OCRExtractor()
        text = extractor.extract(str(image_path))

        assert "Starbucks" in text
        call_kwargs = mock_pytesseract.image_to_string.call_args
        assert call_kwargs[1].get("config") == "--psm 6"


def test_preprocesses_image_before_ocr(tmp_path):
    """Image is preprocessed (grayscale, deskew) before being passed to Tesseract"""
    import cv2

    # Create a real image with a white rectangle on dark background (simulates receipt)
    image = np.zeros((500, 400, 3), dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 460), (255, 255, 255), -1)
    image_path = str(tmp_path / "receipt.jpg")
    cv2.imwrite(image_path, image)

    with patch("src.extractors.ocr_extractor.pytesseract") as mock_pytesseract:
        mock_pytesseract.image_to_string.return_value = "Preprocessed receipt text"

        extractor = OCRExtractor()
        text = extractor.extract(image_path)

        assert text == "Preprocessed receipt text"
        # The image passed to Tesseract should be a preprocessed numpy array
        passed_image = mock_pytesseract.image_to_string.call_args[0][0]
        assert isinstance(passed_image, np.ndarray)
        # Should have valid image dimensions after preprocessing
        assert passed_image.shape[0] > 0
        assert passed_image.shape[1] > 0


def test_falls_back_to_grayscale_when_no_receipt_contour_found(tmp_path):
    """OCR still runs when no 4-point receipt contour is detected in the image"""
    import cv2

    # Create an image with no clear rectangular contour (gradient noise)
    image = np.random.randint(0, 255, (400, 300, 3), dtype=np.uint8)
    cv2.GaussianBlur(image, (15, 15), 0, dst=image)
    image_path = str(tmp_path / "noisy.jpg")
    cv2.imwrite(image_path, image)

    with patch("src.extractors.ocr_extractor.pytesseract") as mock_pytesseract:
        mock_pytesseract.image_to_string.return_value = "No contour found text"

        extractor = OCRExtractor()
        text = extractor.extract(image_path)

        assert text == "No contour found text"
        # Should still pass a valid image to Tesseract
        passed_image = mock_pytesseract.image_to_string.call_args[0][0]
        assert isinstance(passed_image, np.ndarray)
