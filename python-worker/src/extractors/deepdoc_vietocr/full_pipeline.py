"""Reusable in-memory document extraction with DeepDoc and VietOCR."""

from __future__ import annotations

import argparse
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pdfplumber
from PIL import Image, ImageDraw

from .module import LayoutRecognizer, TableStructureRecognizer
from .module.ocr import OCR


@dataclass(frozen=True)
class BoundingBox:
    """A layout or OCR region expressed in image pixels."""

    left: int
    top: int
    right: int
    bottom: int

    @classmethod
    def from_layout(cls, region: Mapping[str, Any]) -> "BoundingBox":
        coordinates = region.get("bbox")
        if not isinstance(coordinates, (list, tuple)):
            coordinates = [
                region.get("x0"),
                region.get("top"),
                region.get("x1"),
                region.get("bottom"),
            ]
        if len(coordinates) != 4:
            raise ValueError("layout region must include four bounding-box coordinates")

        left, top, right, bottom = map(int, coordinates)
        return cls(left, top, right, bottom)

    @classmethod
    def from_ocr_polygon(cls, polygon: object) -> "BoundingBox | None":
        if not isinstance(polygon, list) or not polygon:
            return None

        points = [
            point
            for point in polygon
            if isinstance(point, (list, tuple)) and len(point) >= 2
        ]
        if not points:
            return None

        return cls(
            min(int(point[0]) for point in points),
            min(int(point[1]) for point in points),
            max(int(point[0]) for point in points),
            max(int(point[1]) for point in points),
        )


@dataclass(frozen=True)
class ExtractedBlock:
    """Markdown content positioned in the source document's reading order."""

    bounds: BoundingBox
    markdown: str


def load_document_pages(file_path: str) -> list[Image.Image]:
    """Load an image or rasterize every PDF page as an RGB image."""
    source = Path(file_path)
    if source.suffix.lower() == ".pdf":
        with pdfplumber.open(source) as pdf:
            return [
                page.to_image(resolution=216).original.convert("RGB")
                for page in pdf.pages
            ]

    with Image.open(source) as image:
        return [image.convert("RGB")]


class DeepDocPipeline:
    """Keep DeepDoc models warm and extract Markdown from one document at a time."""

    def __init__(
        self,
        layout_threshold: float = 0.5,
        *,
        layout_recognizer: Any | None = None,
        ocr: Any | None = None,
        table_structure_recognizer: Any | None = None,
        page_loader: Callable[[str], list[Image.Image]] = load_document_pages,
    ):
        if not 0 <= layout_threshold <= 1:
            raise ValueError("layout_threshold must be between 0 and 1")

        self._layout_threshold = layout_threshold
        self._layout_recognizer = layout_recognizer or LayoutRecognizer("layout")
        self._ocr = ocr or OCR()
        self._table_structure_recognizer = table_structure_recognizer
        self._page_loader = page_loader

    def extract(self, file_path: str, /) -> str:
        """Extract Markdown without creating result files beside the source."""
        pages: list[str] = []
        for image in self._page_loader(file_path):
            try:
                page = self._extract_page(image)
            finally:
                image.close()
            if page:
                pages.append(page)
        return "\n\n".join(pages)

    def _extract_page(self, image: Image.Image) -> str:
        table_regions = self._table_regions(image)
        blocks = [self._extract_table(image, region) for region in table_regions]
        blocks.extend(self._extract_text(image, table_regions))

        return "\n\n".join(
            block.markdown
            for block in sorted(blocks, key=lambda block: (block.bounds.top, block.bounds.left))
            if block.markdown.strip()
        )

    def _table_regions(self, image: Image.Image) -> list[Mapping[str, Any]]:
        page_layouts = self._layout_recognizer.forward(
            [image], thr=self._layout_threshold
        )
        layouts = page_layouts[0] if page_layouts else []
        return [
            region
            for region in layouts
            if isinstance(region, Mapping)
            and str(region.get("type", "")).lower() == "table"
            and self._confidence(region) >= self._layout_threshold
        ]

    def _extract_table(
        self,
        image: Image.Image,
        region: Mapping[str, Any],
    ) -> ExtractedBlock:
        bounds = BoundingBox.from_layout(region)
        table_image = image.crop((bounds.left, bounds.top, bounds.right, bounds.bottom))
        try:
            markdown = self._table_markdown(table_image)
        finally:
            table_image.close()
        return ExtractedBlock(bounds, markdown)

    def _extract_text(
        self,
        image: Image.Image,
        table_regions: Iterable[Mapping[str, Any]],
    ) -> list[ExtractedBlock]:
        # OCR all non-table content. The old mask only retained its bounding
        # rectangle and could silently omit detected text regions.
        text_image = image.copy()
        try:
            draw = ImageDraw.Draw(text_image)
            for region in table_regions:
                bounds = BoundingBox.from_layout(region)
                draw.rectangle(
                    (bounds.left, bounds.top, bounds.right, bounds.bottom),
                    fill="white",
                )
            return self._ocr_blocks(text_image)
        finally:
            text_image.close()

    def _ocr_blocks(self, image: Image.Image) -> list[ExtractedBlock]:
        results = self._ocr(np.asarray(image)) or []
        blocks: list[ExtractedBlock] = []

        for item in results:
            if not isinstance(item, tuple) or len(item) != 2:
                continue
            bounds = BoundingBox.from_ocr_polygon(item[0])
            recognition = item[1]
            if (
                bounds is None
                or not isinstance(recognition, (list, tuple))
                or not recognition
                or not isinstance(recognition[0], str)
                or not recognition[0].strip()
            ):
                continue
            blocks.append(ExtractedBlock(bounds, recognition[0].strip()))

        return blocks

    def _table_markdown(self, image: Image.Image) -> str:
        components = self._table_recognizer()([image])
        table_components = components[0] if components else []
        ocr_results = self._ocr(np.asarray(image)) or []
        boxes = self._table_text_boxes(ocr_results)
        if not boxes:
            return ""
        if not table_components:
            return "\n".join(box["text"] for box in boxes)

        text_heights = [box["bottom"] - box["top"] for box in boxes]
        boxes = LayoutRecognizer.sort_Y_firstly(boxes, np.mean(text_heights) / 3)

        def gather(pattern: str, fuzz: int = 10, position: float = 0.6):
            elements = LayoutRecognizer.sort_Y_firstly(
                [component for component in table_components if re.match(pattern, component["label"])],
                fuzz,
            )
            elements = LayoutRecognizer.layouts_cleanup(boxes, elements, 5, position)
            return LayoutRecognizer.sort_Y_firstly(elements, 0)

        headers = gather(r".*header$")
        rows = gather(r".* (row|header)")
        spans = gather(r".*spanning")
        columns = sorted(
            [
                component
                for component in table_components
                if re.match(r"table column$", component["label"])
            ],
            key=lambda component: component["x0"],
        )
        columns = LayoutRecognizer.layouts_cleanup(boxes, columns, 5, 0.5)

        for box in boxes:
            self._assign_table_structure(box, rows, headers, columns, spans)

        markdown = TableStructureRecognizer.construct_table(boxes, markdown=True)
        return markdown if isinstance(markdown, str) else "\n".join(markdown)

    @staticmethod
    def _table_text_boxes(ocr_results: Iterable[object]) -> list[dict[str, Any]]:
        boxes: list[dict[str, Any]] = []
        for item in ocr_results:
            if not isinstance(item, tuple) or len(item) != 2:
                continue
            bounds = BoundingBox.from_ocr_polygon(item[0])
            recognition = item[1]
            if (
                bounds is None
                or not isinstance(recognition, (list, tuple))
                or not recognition
                or not isinstance(recognition[0], str)
                or not recognition[0].strip()
            ):
                continue
            boxes.append(
                {
                    "x0": bounds.left,
                    "x1": bounds.right,
                    "top": bounds.top,
                    "bottom": bounds.bottom,
                    "text": recognition[0].strip(),
                    "layout_type": "table",
                    "page_number": 0,
                }
            )
        return boxes

    @staticmethod
    def _assign_table_structure(
        box: dict[str, Any],
        rows: list[dict[str, Any]],
        headers: list[dict[str, Any]],
        columns: list[dict[str, Any]],
        spans: list[dict[str, Any]],
    ) -> None:
        row_index = LayoutRecognizer.find_overlapped_with_threashold(box, rows, thr=0.3)
        if row_index is not None:
            box["R"] = row_index
            box["R_top"] = rows[row_index]["top"]
            box["R_bott"] = rows[row_index]["bottom"]

        header_index = LayoutRecognizer.find_overlapped_with_threashold(
            box, headers, thr=0.3
        )
        if header_index is not None:
            box["H_top"] = headers[header_index]["top"]
            box["H_bott"] = headers[header_index]["bottom"]
            box["H_left"] = headers[header_index]["x0"]
            box["H_right"] = headers[header_index]["x1"]
            box["H"] = header_index

        column_index = LayoutRecognizer.find_horizontally_tightest_fit(box, columns)
        if column_index is not None:
            box["C"] = column_index
            box["C_left"] = columns[column_index]["x0"]
            box["C_right"] = columns[column_index]["x1"]

        span_index = LayoutRecognizer.find_overlapped_with_threashold(box, spans, thr=0.3)
        if span_index is not None:
            box["H_top"] = spans[span_index]["top"]
            box["H_bott"] = spans[span_index]["bottom"]
            box["H_left"] = spans[span_index]["x0"]
            box["H_right"] = spans[span_index]["x1"]
            box["SP"] = span_index

    def _table_recognizer(self) -> Any:
        if self._table_structure_recognizer is None:
            self._table_structure_recognizer = TableStructureRecognizer()
        return self._table_structure_recognizer

    @staticmethod
    def _confidence(region: Mapping[str, Any]) -> float:
        confidence = region.get("score", 1.0)
        return float(confidence) if isinstance(confidence, (int, float)) else 1.0


def main(args: argparse.Namespace) -> str:
    """Run the pipeline from the command line and return its Markdown."""
    return DeepDocPipeline(layout_threshold=float(args.threshold)).extract(args.inputs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", required=True, help="Image or PDF file path")
    parser.add_argument("--threshold", default=0.5, help="Layout threshold")
    print(main(parser.parse_args()))
