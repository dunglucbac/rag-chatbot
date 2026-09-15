from unittest.mock import Mock

import pytest
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import OcrMode

from src.extractors.docling_extractor import DoclingExtractor


class FakeDocument:
    def __init__(self):
        self.texts = [
            FakeTextItem("Store"),
            FakeTextItem("Coffee 4.50"),
            FakeTextItem("Total 4.50"),
        ]
        self.items = self.texts

    def iterate_items(self):
        return ((item, 1) for item in self.items)

    def export_to_markdown(self):
        return "Store\nCoffee 4.50\nTotal 4.50"


class ImageOnlyDocument:
    def __init__(self):
        self.texts = [
            FakeTextItem("Royal Mail"),
            FakeTextItem("Total 4.69"),
        ]
        self.items = self.texts

    def iterate_items(self):
        return ((item, 1) for item in self.items)

    def export_to_markdown(self):
        return "<!-- image -->"


class FakeTextItem:
    def __init__(self, text):
        self.text = text


class FakeTableItem:
    def __init__(self, markdown):
        self.markdown = markdown
        self.document = None

    def export_to_markdown(self, doc=None):
        self.document = doc
        return self.markdown


class TableReceiptDocument:
    def __init__(self):
        self.items = [
            FakeTextItem("Store"),
            FakeTableItem("| Coffee | 4.50 |"),
            FakeTextItem("Total 4.50"),
        ]

    def iterate_items(self):
        return ((item, 1) for item in self.items)


class FakeConversionResult:
    status = ConversionStatus.SUCCESS
    document = FakeDocument()


def test_extracts_joined_text_items_from_pdf_or_image_with_docling():
    converter = Mock()
    converter.convert.return_value = FakeConversionResult()

    extractor = DoclingExtractor(converter=converter)

    text = extractor.extract("/path/to/receipt.jpg")

    assert text == "Store\n\nCoffee 4.50\n\nTotal 4.50"
    converter.convert.assert_called_once_with("/path/to/receipt.jpg")


def test_returns_text_items_when_markdown_only_an_image_is_exported():
    converter = Mock()
    converter.convert.return_value = Mock(
        status=ConversionStatus.SUCCESS,
        document=ImageOnlyDocument(),
    )

    text = DoclingExtractor(converter=converter).extract("/path/to/receipt.jpg")

    assert text == "Royal Mail\n\nTotal 4.69"


def test_preserves_table_cells_in_the_extracted_text():
    converter = Mock()
    converter.convert.return_value = Mock(
        status=ConversionStatus.SUCCESS,
        document=TableReceiptDocument(),
    )

    text = DoclingExtractor(converter=converter).extract("/path/to/receipt.pdf")

    assert text == "Store\n\n| Coffee | 4.50 |\n\nTotal 4.50"
    assert converter.convert.return_value.document.items[1].document is converter.convert.return_value.document


def test_preserves_embedded_pdf_text_while_ocring_image_receipts():
    converter = DoclingExtractor()._build_converter()

    pdf_options = converter.format_to_options[InputFormat.PDF].pipeline_options
    image_options = converter.format_to_options[InputFormat.IMAGE].pipeline_options

    assert pdf_options.ocr_options.mode == OcrMode.PDF_AWARE_LAYOUT_REGIONS
    assert image_options.ocr_options.mode == OcrMode.FULL_PAGE
    assert pdf_options.ocr_options.lang == ["vi"]
    assert image_options.ocr_options.lang == ["vi"]


def test_raises_when_docling_returns_partial_success():
    converter = Mock()
    converter.convert.return_value = Mock(
        status=ConversionStatus.PARTIAL_SUCCESS,
        document=FakeDocument(),
        errors=[Mock(error_message="Page 2 failed")],
    )

    extractor = DoclingExtractor(converter=converter)

    with pytest.raises(
        RuntimeError,
        match="status=partial_success; errors=Page 2 failed",
    ):
        extractor.extract("/path/to/partial.pdf")
