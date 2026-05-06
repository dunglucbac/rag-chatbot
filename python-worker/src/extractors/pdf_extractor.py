from PyPDF2 import PdfReader


class PDFExtractor:
    def extract(self, file_path: str) -> str:
        """Extract text from a PDF file"""
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        return text

    def needs_ocr(self, text: str) -> bool:
        """Determine if OCR is needed based on extracted text length"""
        return len(text) < 50
