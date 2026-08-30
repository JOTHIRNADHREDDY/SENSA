"""
SENSA Licence Plate Recognition (ALPR)

Runs after vehicle detection: when a vehicle bounding box is found,
this module crops the licence plate region, runs OCR, and returns
the plate text to be included in the alert.

Uses two approaches:
  1. Primary:  fast-plate-ocr (lightweight, works offline, Indian plates)
  2. Fallback: Tesseract OCR (slower, universal)

Why both: fast-plate-ocr handles common Indian plates well; Tesseract
handles unusual formats and serves as a fallback.

Alert message becomes:
  "Vehicle detected — Plate: MH12AB1234 — entering Gate Perimeter"

Plate history is stored for audit (fleet tracking, blacklist matching).
"""
import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger("SENSA.alpr")

# Indian plate regex patterns
INDIAN_PLATE_PATTERNS = [
    re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$"),      # MH12AB1234
    re.compile(r"^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$"),         # KA05MG1234
    re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$"),             # 22BH1234AA (BH series)
    re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}$"),     # Short plates
]


class LicencePlateRecognizer:
    def __init__(self):
        self._engine = None
        self._engine_name = None
        self._init_engine()

    def _init_engine(self):
        """Try to load the best available OCR engine."""
        # Try fast-plate-ocr first (best for Indian plates, lightweight)
        try:
            from fast_plate_ocr import ONNXPlateRecognizer
            self._engine = ONNXPlateRecognizer("global-plates-mobile-vit-v2-model")
            self._engine_name = "fast-plate-ocr"
            log.info("ALPR: using fast-plate-ocr engine")
            return
        except ImportError:
            pass

        # Try EasyOCR (good accuracy, heavier)
        try:
            import easyocr
            self._engine = easyocr.Reader(["en"], gpu=False, verbose=False)
            self._engine_name = "easyocr"
            log.info("ALPR: using EasyOCR engine")
            return
        except ImportError:
            pass

        # Try Tesseract
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            self._engine_name = "tesseract"
            log.info("ALPR: using Tesseract engine")
            return
        except Exception:
            pass

        log.warning("ALPR: no OCR engine available. Install fast-plate-ocr or pytesseract.")

    async def recognize(
        self,
        frame: np.ndarray,
        vehicle_bbox: tuple[float, float, float, float],  # x1,y1,x2,y2 normalised
    ) -> Optional[str]:
        """
        Crop vehicle region from frame and extract licence plate text.
        Returns plate string (e.g. "MH12AB1234") or None if not found.
        """
        if self._engine_name is None:
            return None

        h, w = frame.shape[:2]
        x1, y1, x2, y2 = vehicle_bbox
        # Convert normalised to pixels
        px1, py1 = int(x1 * w), int(y1 * h)
        px2, py2 = int(x2 * w), int(y2 * h)

        # Crop vehicle region with 10% padding
        pad_x = int((px2 - px1) * 0.1)
        pad_y = int((py2 - py1) * 0.1)
        px1 = max(0, px1 - pad_x)
        py1 = max(0, py1 - pad_y)
        px2 = min(w, px2 + pad_x)
        py2 = min(h, py2 + pad_y)

        vehicle_crop = frame[py1:py2, px1:px2]
        if vehicle_crop.size == 0:
            return None

        # Run in executor to avoid blocking
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, self._run_ocr, vehicle_crop
        )
        return result

    def _run_ocr(self, vehicle_crop: np.ndarray) -> Optional[str]:
        """Run OCR synchronously (called in thread pool)."""
        try:
            import cv2

            # Preprocess: enhance contrast for plate region
            gray = cv2.cvtColor(vehicle_crop, cv2.COLOR_BGR2GRAY)
            gray = cv2.bilateralFilter(gray, 11, 17, 17)
            edged = cv2.Canny(gray, 30, 200)

            if self._engine_name == "fast-plate-ocr":
                plates = self._engine.run(vehicle_crop)
                if plates:
                    return self._clean_plate(plates[0])

            elif self._engine_name == "easyocr":
                results = self._engine.readtext(vehicle_crop)
                candidates = [text for _, text, conf in results if conf > 0.4]
                for candidate in candidates:
                    cleaned = self._clean_plate(candidate)
                    if self._looks_like_plate(cleaned):
                        return cleaned

            elif self._engine_name == "tesseract":
                import pytesseract
                config = "--psm 8 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
                text = pytesseract.image_to_string(gray, config=config).strip()
                cleaned = self._clean_plate(text)
                if self._looks_like_plate(cleaned):
                    return cleaned

        except Exception as e:
            log.debug(f"OCR error: {e}")

        return None

    @staticmethod
    def _clean_plate(text: str) -> str:
        """Remove spaces, special chars, lowercase → uppercase."""
        return re.sub(r"[^A-Z0-9]", "", text.upper().strip())

    @staticmethod
    def _looks_like_plate(text: str) -> bool:
        """Validate if text looks like a real licence plate."""
        if len(text) < 4 or len(text) > 12:
            return False
        has_letter = any(c.isalpha() for c in text)
        has_digit  = any(c.isdigit() for c in text)
        return has_letter and has_digit


# ── PLATE BLACKLIST (admin can block specific plates) ────────────────────────
class PlateBlacklist:
    """
    Checks detected plates against a blacklist stored in the backend.
    Blacklisted plates immediately trigger an escalated alert.
    """
    def __init__(self):
        self._blacklist: set[str] = set()

    def update(self, plates: list[str]):
        self._blacklist = set(p.upper() for p in plates)

    def is_blacklisted(self, plate: str) -> bool:
        return plate.upper() in self._blacklist


# ── MODULE-LEVEL SINGLETONS ────────────────────────────────────────────────────
_recognizer: Optional[LicencePlateRecognizer] = None
_blacklist   = PlateBlacklist()


def get_recognizer() -> LicencePlateRecognizer:
    global _recognizer
    if _recognizer is None:
        _recognizer = LicencePlateRecognizer()
    return _recognizer
