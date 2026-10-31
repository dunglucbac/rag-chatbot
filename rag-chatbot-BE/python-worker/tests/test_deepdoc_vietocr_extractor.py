from unittest.mock import Mock

from PIL import Image

from src.extractors.deepdoc_vietocr.full_pipeline import DeepDocPipeline
from src.extractors.deepdoc_vietocr_extractor import DeepDocVietOcrExtractor
from src.extractors.document_extractor import DocumentExtractor


def test_extractor_creates_and_reuses_one_pipeline():
    pipeline = Mock()
    pipeline.extract.side_effect = ["First document", "Second document"]
    pipeline_factory = Mock(return_value=pipeline)
    extractor = DeepDocVietOcrExtractor(
        layout_threshold=0.7,
        pipeline_factory=pipeline_factory,
    )

    assert extractor.extract("/path/to/one.jpg") == "First document"
    assert extractor.extract("/path/to/two.jpg") == "Second document"

    pipeline_factory.assert_called_once_with(0.7)
    assert pipeline.extract.call_args_list[0].args == ("/path/to/one.jpg",)
    assert pipeline.extract.call_args_list[1].args == ("/path/to/two.jpg",)
    assert isinstance(extractor, DocumentExtractor)


def test_pipeline_keeps_detected_text_and_returns_reading_order_without_files(
    monkeypatch, tmp_path
):
    layout_recognizer = Mock()
    layout_recognizer.forward.return_value = [
        [{"type": "Text", "score": 0.99, "bbox": [0, 0, 20, 20]}]
    ]
    ocr = Mock(
        return_value=[
            ([[0, 20], [10, 20], [10, 30], [0, 30]], ("Second", 1.0)),
            ([[0, 0], [10, 0], [10, 10], [0, 10]], ("First", 1.0)),
        ]
    )
    table_recognizer = Mock()
    image = Image.new("RGB", (20, 40), "white")
    pipeline = DeepDocPipeline(
        layout_recognizer=layout_recognizer,
        ocr=ocr,
        table_structure_recognizer=table_recognizer,
        page_loader=lambda _: [image],
    )

    monkeypatch.chdir(tmp_path)

    assert pipeline.extract("receipt.jpg") == "First\n\nSecond"
    table_recognizer.assert_not_called()
    assert list(tmp_path.iterdir()) == []
