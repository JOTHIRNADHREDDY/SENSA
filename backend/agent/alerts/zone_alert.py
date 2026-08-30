"""
SENSA ZoneAlertNode — 5-layer false alarm filter.

For each detection from CameraNode, checks:
  1. Confidence >= threshold (already filtered by YOLO, double-check)
  2. Bounding box area >= 2% of frame (rejects tiny/distant objects)
  3. Point-in-polygon check (Shapely)
  4. Dwell time >= 1.5s (object must stay in zone before alert fires)
  5. 60-second deduplication per zone (one alert per zone per minute)
  6. Schedule check (zone may be active only during certain hours)
"""
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from shapely.geometry import Point, Polygon

log = logging.getLogger("SENSA.zone_alert")

MIN_BBOX_AREA    = 0.002   # 0.2% of frame area
DWELL_SECONDS    = 1.5     # seconds object must stay in zone
DEDUP_SECONDS    = 60      # cooldown per zone after alert fires


class ZoneAlertNode:
    def __init__(self, cam_cfg):
        self.cam       = cam_cfg
        self._dwell:   dict[str, float] = {}   # zone_id → first_seen ts
        self._last_alert: dict[str, float] = {} # zone_id → last alert ts

    def check(self, detection: dict, ts: float) -> Optional[dict]:
        """
        Run all 5 filters. Returns alert dict if all pass, else None.
        """
        # Filter 2: minimum bounding box area
        if detection.get("bbox_area", 0) < MIN_BBOX_AREA:
            return None

        cx = detection["bbox_cx"]
        cy = detection["bbox_cy"]
        pt = Point(cx, cy)

        for zone in self.cam.zones:
            if not zone.get("active", True):
                continue

            # Filter 6: schedule check
            if not self._in_schedule(zone, ts):
                continue

            # Filter 3: point-in-polygon
            try:
                poly = Polygon(zone["points"])
                if not poly.contains(pt):
                    continue
            except Exception:
                continue

            zone_id = zone["id"]

            # Filter 4: dwell time
            if zone_id not in self._dwell:
                self._dwell[zone_id] = ts
                continue
            if ts - self._dwell[zone_id] < DWELL_SECONDS:
                continue

            # Filter 5: deduplication
            last = self._last_alert.get(zone_id, 0)
            if ts - last < DEDUP_SECONDS:
                continue

            # All filters passed — fire alert
            self._last_alert[zone_id] = ts
            self._dwell.pop(zone_id, None)

            return {
                "id":          str(uuid.uuid4()),
                "camera_id":   self.cam.id,
                "camera_name": self.cam.name,
                "zone_id":     zone_id,
                "zone_name":   zone.get("name", "Zone"),
                "class_name":  detection["class_name"],
                "confidence":  detection["confidence"],
                "bbox":        detection["bbox"],
                "bbox_cx":     detection["bbox_cx"],
                "bbox_cy":     detection["bbox_cy"],
                "triggered_at": ts,
            }

        # Object not in any zone — reset dwell timers for zones it left
        for zone in self.cam.zones:
            zone_id = zone.get("id", "")
            try:
                poly = Polygon(zone["points"])
                pt2  = Point(cx, cy)
                if not poly.contains(pt2) and zone_id in self._dwell:
                    self._dwell.pop(zone_id)
            except Exception:
                pass

        return None

    @staticmethod
    def _in_schedule(zone: dict, ts: float) -> bool:
        """Return True if current time is within the zone's active schedule."""
        if not zone.get("schedule_enabled", False):
            return True
        try:
            now = datetime.fromtimestamp(ts, tz=timezone.utc)
            hour = now.hour
            start_h, start_m = map(int, zone.get("schedule_start", "22:00").split(":"))
            end_h,   end_m   = map(int, zone.get("schedule_end",   "06:00").split(":"))
            start_mins = start_h * 60 + start_m
            end_mins   = end_h   * 60 + end_m
            now_mins   = hour    * 60 + now.minute
            if start_mins <= end_mins:
                return start_mins <= now_mins <= end_mins
            else:  # wraps midnight
                return now_mins >= start_mins or now_mins <= end_mins
        except Exception:
            return True
