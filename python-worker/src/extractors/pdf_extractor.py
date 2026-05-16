from PyPDF2 import PdfReader
from src.extractors.base_extractor import BaseExtractor


class PDFExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        """Extract text from a PDF file"""
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        return text
