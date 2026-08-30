"""
SENSA Heatmap Generator

Aggregates all alert bounding-box centre points over time and renders
a heatmap overlay on the camera's reference frame.

Shows security managers WHERE in the frame activity happens most —
useful for optimising zone placement and identifying high-risk areas.

Outputs:
  - JPEG heatmap image (base64 PNG for dashboard display)
  - Hotspot coordinates (top-3 most active areas)
  - Activity by hour (bar chart data)
  - Activity by day of week

Called by:
  GET /api/cameras/{id}/heatmap?days=30
"""
import asyncio
import base64
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np

log = logging.getLogger("SENSA.heatmap")


class HeatmapGenerator:
    def __init__(self, width: int = 640, height: int = 360):
        self.w = width
        self.h = height

    def generate(
        self,
        detection_points: list[tuple[float, float]],   # list of (cx, cy) normalised 0-1
        reference_frame: Optional[np.ndarray] = None,
        colormap: str = "jet",
    ) -> dict:
        """
        Generate a heatmap from detection centre points.

        Args:
            detection_points: list of (cx, cy) normalised coordinates
            reference_frame: optional background frame to overlay on
            colormap: OpenCV colormap name ('jet', 'hot', 'plasma')

        Returns dict with:
            image_b64: base64-encoded JPEG heatmap
            hotspots: top-3 most active normalised coordinates
            total_detections: int
        """
        try:
            import cv2
        except ImportError:
            return {"error": "OpenCV not available"}

        if not detection_points:
            return {"image_b64": None, "hotspots": [], "total_detections": 0}

        # Build accumulation map
        heatmap = np.zeros((self.h, self.w), dtype=np.float32)

        for cx, cy in detection_points:
            px = int(cx * self.w)
            py = int(cy * self.h)
            if 0 <= px < self.w and 0 <= py < self.h:
                heatmap[py, px] += 1.0

        # Gaussian blur to smooth the heatmap
        sigma = max(self.w, self.h) // 20  # adaptive blur radius
        heatmap = cv2.GaussianBlur(heatmap, (0, 0), sigma)

        # Normalise to 0-255
        if heatmap.max() > 0:
            heatmap = (heatmap / heatmap.max() * 255).astype(np.uint8)

        # Apply colormap
        cmap_id = getattr(cv2, f"COLORMAP_{colormap.upper()}", cv2.COLORMAP_JET)
        colored = cv2.applyColorMap(heatmap, cmap_id)

        # Blend with reference frame if provided
        if reference_frame is not None:
            ref = cv2.resize(reference_frame, (self.w, self.h))
            # Create alpha mask from heatmap intensity
            alpha = (heatmap.astype(np.float32) / 255.0)
            alpha_3ch = np.stack([alpha] * 3, axis=2)
            overlay = (colored * alpha_3ch + ref * (1 - alpha_3ch * 0.7)).astype(np.uint8)
        else:
            # Dark background
            bg = np.full((self.h, self.w, 3), 20, dtype=np.uint8)
            alpha = (heatmap.astype(np.float32) / 255.0)
            alpha_3ch = np.stack([alpha] * 3, axis=2)
            overlay = (colored * alpha_3ch + bg * (1 - alpha_3ch)).astype(np.uint8)

        # Encode to JPEG
        _, buf = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 85])
        image_b64 = base64.b64encode(buf.tobytes()).decode()

        # Find top-3 hotspots
        hotspots = self._find_hotspots(heatmap, top_n=3)

        return {
            "image_b64": image_b64,
            "hotspots": hotspots,
            "total_detections": len(detection_points),
            "resolution": f"{self.w}×{self.h}",
        }

    def _find_hotspots(
        self, heatmap: np.ndarray, top_n: int = 3
    ) -> list[dict]:
        """
        Find the N most active regions using local maxima detection.
        Returns normalised coordinates.
        """
        try:
            import cv2
            result = []
            temp = heatmap.copy()

            for _ in range(top_n):
                _, max_val, _, max_loc = cv2.minMaxLoc(temp)
                if max_val < 10:
                    break

                cx_norm = max_loc[0] / self.w
                cy_norm = max_loc[1] / self.h
                result.append({
                    "x": round(cx_norm, 3),
                    "y": round(cy_norm, 3),
                    "intensity": round(float(max_val) / 255.0, 2),
                })

                # Suppress region around this hotspot
                radius = max(self.w, self.h) // 8
                cv2.circle(temp, max_loc, radius, 0, -1)

            return result
        except Exception:
            return []


def aggregate_hourly(
    alerts: list[dict],
) -> dict:
    """
    Aggregate alert counts by hour of day and day of week.
    Used for the heatmap page's activity charts.

    Args:
        alerts: list of dicts with 'triggered_at' (unix timestamp)
                and 'bbox' (optional)

    Returns:
        {
          "by_hour": [0]*24,          # count per hour 0-23
          "by_day":  [0]*7,           # count per day 0=Mon 6=Sun
          "by_camera": {"cam_id": n},
          "by_class":  {"person": n, "vehicle": n},
          "peak_hour":  14,
          "peak_day":   "Friday",
        }
    """
    by_hour    = [0] * 24
    by_day     = [0] * 7
    by_camera  = {}
    by_class   = {"person": 0, "vehicle": 0}

    for alert in alerts:
        ts = alert.get("triggered_at", 0)
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        by_hour[dt.hour] += 1
        by_day[dt.weekday()] += 1

        cam = alert.get("camera_id", "unknown")
        by_camera[cam] = by_camera.get(cam, 0) + 1

        cls = alert.get("class_name", "person")
        if cls in by_class:
            by_class[cls] += 1

    peak_hour = by_hour.index(max(by_hour)) if any(by_hour) else 0
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    peak_day  = days[by_day.index(max(by_day))] if any(by_day) else "Unknown"

    return {
        "by_hour":   by_hour,
        "by_day":    by_day,
        "by_camera": by_camera,
        "by_class":  by_class,
        "peak_hour": peak_hour,
        "peak_day":  peak_day,
    }
