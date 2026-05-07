from abc import ABC, abstractmethod


class BaseExtractor(ABC):
    @abstractmethod
    def extract(self, file_path: str) -> str:
        """Extract text from a file at the given path"""
        ...

    def needs_ocr(self, text: str) -> bool:
        """Determine if OCR is needed based on extracted text length"""
        return len(text) < 50
