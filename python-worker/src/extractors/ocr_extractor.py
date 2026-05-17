import cv2
import numpy as np
import pytesseract
from src.extractors.base_extractor import BaseExtractor


class OCRExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        """Extract text from an image using Tesseract OCR with preprocessing"""
        image = cv2.imread(file_path)
        preprocessed = self._preprocess(image)
        text = pytesseract.image_to_string(preprocessed, config="--psm 6")
        return text

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for OCR: deskew and prepare for Tesseract"""
        orig = image.copy()

        # Resize to standard width for consistent contour detection
        resized = self._resize_to_width(image, 500)
        ratio = image.shape[1] / float(resized.shape[1])

        # Grayscale, blur, and edge detection
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 75, 200)

        # Find receipt contour
        receipt_contour = self._find_receipt_contour(edged)

        if receipt_contour is not None:
            # Apply perspective transform to deskew
            result = self._four_point_transform(
                orig, receipt_contour.reshape(4, 2) * ratio
            )
        else:
            # Fall back to the grayscale version
            result = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)

        return cv2.cvtColor(result, cv2.COLOR_BGR2RGB) if len(result.shape) == 3 else result

    @staticmethod
    def _resize_to_width(image: np.ndarray, width: int) -> np.ndarray:
        h, w = image.shape[:2]
        if w <= width:
            return image
        ratio = width / float(w)
        new_h = int(h * ratio)
        return cv2.resize(image, (width, new_h), interpolation=cv2.INTER_AREA)

    @staticmethod
    def _find_receipt_contour(edged: np.ndarray):
        """Find the largest 4-point contour (assumed to be the receipt)"""
        cnts = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        cnts = sorted(cnts, key=cv2.contourArea, reverse=True)

        for c in cnts:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                return approx

        return None

    @staticmethod
    def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
        """Apply a perspective transform to obtain a bird's-eye view"""

        def _order_points(pts):
            rect = np.zeros((4, 2), dtype="float32")
            s = pts.sum(axis=1)
            rect[0] = pts[np.argmin(s)]
            rect[2] = pts[np.argmax(s)]
            diff = np.diff(pts, axis=1)
            rect[1] = pts[np.argmin(diff)]
            rect[3] = pts[np.argmax(diff)]
            return rect

        rect = _order_points(pts)
        (tl, tr, br, bl) = rect

        width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
        width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
        max_width = max(int(width_a), int(width_b))

        height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
        height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
        max_height = max(int(height_a), int(height_b))

        dst = np.array(
            [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
            dtype="float32",
        )

        M = cv2.getPerspectiveTransform(rect, dst)
        return cv2.warpPerspective(image, M, (max_width, max_height))
