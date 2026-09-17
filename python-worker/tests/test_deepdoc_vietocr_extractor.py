from unittest.mock import Mock

from PIL import Image

from src.extractors.deepdoc_vietocr import full_pipeline
from src.extractors.deepdoc_vietocr_extractor import DeepDocVietOcrExtractor
from src.extractors.document_extractor import DocumentExtractor


def test_deepdoc_extractor_returns_pipeline_result_without_creating_a_file():
    pipeline = Mock(return_value="Receipt\n\nTotal 4.50")

    extractor = DeepDocVietOcrExtractor(layout_threshold=0.7, pipeline=pipeline)

    assert extractor.extract("/path/to/receipt.jpg") == "Receipt\n\nTotal 4.50"
    pipeline.assert_called_once_with("/path/to/receipt.jpg", 0.7)
    assert isinstance(extractor, DocumentExtractor)


def test_full_pipeline_returns_extracted_text_without_writing_markdown(
    monkeypatch, tmp_path
):
    image = Image.new("RGB", (20, 20), "white")
    layout_recognizer = Mock()
    layout_recognizer.forward.return_value = [[]]
    ocr = Mock(return_value=[(None, ("Extracted text", 1.0))])

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(full_pipeline, "load_document_pages", lambda _: [image])
    monkeypatch.setattr(full_pipeline, "LayoutRecognizer", lambda _: layout_recognizer)
    monkeypatch.setattr(full_pipeline, "OCR", lambda: ocr)

    assert full_pipeline.extract_document("receipt.jpg") == "Extracted text"
    assert list(tmp_path.iterdir()) == []
