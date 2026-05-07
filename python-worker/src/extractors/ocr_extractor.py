import pytesseract
from PIL import Image


class OCRExtractor:
    def extract(self, file_path: str) -> str:
        """Extract text from an image using Tesseract OCR"""
        image = Image.open(file_path)
        text = pytesseract.image_to_string(image)
        return text
