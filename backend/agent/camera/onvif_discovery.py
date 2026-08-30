"""
SENSA ONVIF Discovery — scans the local network for cameras that support
the ONVIF protocol (most modern IP cameras do) and returns their RTSP URLs,
model names, and credentials automatically.

This removes the #1 setup friction: users don't know their RTSP URL.

How it works:
  1. Sends WS-Discovery multicast UDP probe to 239.255.255.250:3702
  2. Cameras that respond are queried for their device info and stream profiles
  3. Returns a list of {ip, name, manufacturer, model, rtsp_url, requires_auth}

Requires: onvif-zeep library (pip install onvif-zeep)
Falls back gracefully if no cameras found or library not installed.
"""
import asyncio
import ipaddress
import logging
import socket
import struct
import uuid
from typing import Optional

log = logging.getLogger("SENSA.onvif")

# WS-Discovery probe message
WSD_PROBE = '''<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{msg_id}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>'''

WSD_MULTICAST = ("239.255.255.250", 3702)
PROBE_TIMEOUT = 5.0   # seconds to listen for camera responses


async def discover_cameras(
    credentials: list[tuple[str, str]] | None = None,
    timeout: float = PROBE_TIMEOUT,
) -> list[dict]:
    """
    Discover ONVIF cameras on the local network.

    Args:
        credentials: list of (username, password) pairs to try.
                     Defaults to common defaults: admin/admin, admin/12345 etc.
        timeout:     seconds to wait for responses (default 5s)

    Returns list of camera dicts:
      {
        "ip": "192.168.1.64",
        "name": "Hikvision DS-2CD2143G2",
        "manufacturer": "Hikvision",
        "model": "DS-2CD2143G2-I",
        "rtsp_url": "rtsp://admin:admin123@192.168.1.64:554/Streaming/Channels/101",
        "main_stream": "rtsp://...",
        "sub_stream": "rtsp://...",   # lower res, better for AI
        "requires_auth": True,
        "onvif_port": 80,
        "firmware": "V5.7.2",
      }
    """
    if credentials is None:
        credentials = _default_credentials()

    log.info("Starting ONVIF camera discovery (%.0fs timeout)…" % timeout)

    # Step 1: UDP multicast probe to find camera IPs
    camera_ips = await _wsd_probe(timeout)
    log.info(f"WS-Discovery found {len(camera_ips)} device(s): {camera_ips}")

    if not camera_ips:
        return []

    # Step 2: Query each camera for details using ONVIF
    tasks = [_query_camera(ip, credentials) for ip in camera_ips]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    cameras = []
    for r in results:
        if isinstance(r, dict):
            cameras.append(r)
        elif isinstance(r, Exception):
            log.debug(f"Camera query failed: {r}")

    log.info(f"Discovery complete: {len(cameras)} camera(s) identified")
    return cameras


async def _wsd_probe(timeout: float) -> list[str]:
    """Send WS-Discovery multicast probe and collect responding IPs."""
    msg_id = str(uuid.uuid4())
    probe = WSD_PROBE.format(msg_id=msg_id).encode()
    ips = set()

    try:
        loop = asyncio.get_running_loop()

        def _udp_probe():
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.settimeout(timeout)
            sock.sendto(probe, WSD_MULTICAST)

            import time
            end = time.time() + timeout
            while time.time() < end:
                try:
                    data, (addr, _) = sock.recvfrom(4096)
                    if b"NetworkVideoTransmitter" in data or b"onvif" in data.lower():
                        ips.add(addr)
                except socket.timeout:
                    break
            sock.close()

        await loop.run_in_executor(None, _udp_probe)
    except Exception as e:
        log.warning(f"WSD probe error: {e}")

    return list(ips)


async def _query_camera(ip: str, credentials: list[tuple[str, str]]) -> dict:
    """Try to connect to camera via ONVIF and extract stream URLs."""
    try:
        from onvif import ONVIFCamera
    except ImportError:
        # ONVIF library not installed — return basic info only
        return {
            "ip": ip,
            "name": f"Camera at {ip}",
            "manufacturer": "Unknown",
            "model": "Unknown",
            "rtsp_url": f"rtsp://{ip}:554/stream1",
            "requires_auth": True,
            "onvif_port": 80,
        }

    loop = asyncio.get_running_loop()

    def _try_credentials():
        for username, password in credentials:
            try:
                cam = ONVIFCamera(ip, 80, username, password, no_cache=True)
                cam.update_xaddrs()

                # Get device info
                device_svc = cam.create_devicemgmt_service()
                info = device_svc.GetDeviceInformation()

                # Get media profiles and stream URIs
                media_svc = cam.create_media_service()
                profiles = media_svc.GetProfiles()

                streams = []
                for profile in profiles[:2]:  # main + sub stream
                    try:
                        uri_req = media_svc.create_type("GetStreamUri")
                        uri_req.ProfileToken = profile.token
                        uri_req.StreamSetup = {
                            "Stream": "RTP-Unicast",
                            "Transport": {"Protocol": "RTSP"},
                        }
                        uri_resp = media_svc.GetStreamUri(uri_req)
                        rtsp = uri_resp.Uri
                        # Inject credentials into URL
                        rtsp = rtsp.replace(
                            "rtsp://", f"rtsp://{username}:{password}@"
                        )
                        streams.append(rtsp)
                    except Exception:
                        pass

                return {
                    "ip": ip,
                    "name": f"{info.Manufacturer} {info.Model}",
                    "manufacturer": info.Manufacturer,
                    "model": info.Model,
                    "firmware": getattr(info, "FirmwareVersion", ""),
                    "serial": getattr(info, "SerialNumber", ""),
                    "rtsp_url": streams[0] if streams else f"rtsp://{username}:{password}@{ip}:554/stream1",
                    "main_stream": streams[0] if len(streams) > 0 else None,
                    "sub_stream": streams[1] if len(streams) > 1 else None,
                    "requires_auth": True,
                    "username": username,
                    "password": password,
                    "onvif_port": 80,
                    "discovered_via": "onvif",
                }
            except Exception:
                continue
        return None

    result = await loop.run_in_executor(None, _try_credentials)
    if result is None:
        raise RuntimeError(f"No valid credentials found for {ip}")
    return result


def _default_credentials() -> list[tuple[str, str]]:
    """Common default credentials for major camera brands."""
    return [
        # Generic
        ("admin",  "admin"),
        ("admin",  ""),
        ("admin",  "12345"),
        ("admin",  "123456"),
        ("admin",  "admin123"),
        ("admin",  "Admin123"),
        # Hikvision
        ("admin",  "admin12345"),
        ("admin",  "hik12345"),
        # Dahua
        ("admin",  "admin"),
        ("888888", "888888"),
        # CP Plus
        ("admin",  "admin"),
        ("admin",  "Admin@123"),
        # Axis
        ("root",   "pass"),
        ("root",   "root"),
        # Reolink
        ("admin",  ""),
        # Bosch
        ("service","service"),
    ]


# ── RTSP URL builder for known brands (when ONVIF not available) ─────────────
BRAND_RTSP_PATTERNS = {
    "hikvision": {
        "main": "rtsp://{user}:{pass}@{ip}:554/Streaming/Channels/101",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/Streaming/Channels/102",
    },
    "dahua": {
        "main": "rtsp://{user}:{pass}@{ip}:554/cam/realmonitor?channel=1&subtype=0",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/cam/realmonitor?channel=1&subtype=1",
    },
    "cpplus": {
        "main": "rtsp://{user}:{pass}@{ip}:554/H264?ch=1&subtype=0",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/H264?ch=1&subtype=1",
    },
    "axis": {
        "main": "rtsp://{user}:{pass}@{ip}:554/axis-media/media.amp",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/axis-media/media.amp?resolution=640x480",
    },
    "reolink": {
        "main": "rtsp://{user}:{pass}@{ip}:554//h264Preview_01_main",
        "sub":  "rtsp://{user}:{pass}@{ip}:554//h264Preview_01_sub",
    },
    "uniview": {
        "main": "rtsp://{user}:{pass}@{ip}:554/media/video1",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/media/video2",
    },
    "bosch": {
        "main": "rtsp://{user}:{pass}@{ip}:554/rtsp_tunnel",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/rtsp_tunnel",
    },
    "hanwha": {
        "main": "rtsp://{user}:{pass}@{ip}:554/profile1/media.smp",
        "sub":  "rtsp://{user}:{pass}@{ip}:554/profile2/media.smp",
    },
}


def build_rtsp_url(brand: str, ip: str, username: str, password: str, stream: str = "sub") -> str:
    """
    Build an RTSP URL for a known camera brand without ONVIF.
    Uses 'sub' stream by default (lower res, better for AI inference).
    """
    brand_lower = brand.lower().replace(" ", "").replace("-", "")
    for key, patterns in BRAND_RTSP_PATTERNS.items():
        if key in brand_lower:
            url = patterns.get(stream, patterns["main"])
            return url.format(**{"user": username, "pass": password, "ip": ip})
    # Generic fallback
    return f"rtsp://{username}:{password}@{ip}:554/stream1"
