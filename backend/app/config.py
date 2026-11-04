import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("SENSA_DATA_DIR", ROOT / "data")).resolve()
DATA.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA / 'sensa.db'}")
PRODUCTION = os.getenv("SENSA_ENV") == "production"
AUTH_MODE = os.getenv("SENSA_AUTH_MODE", "signin")
if AUTH_MODE not in {"signin", "local", "public"}:
    raise ValueError("SENSA_AUTH_MODE must be signin, local or public")
if PRODUCTION and AUTH_MODE == "local":
    raise ValueError("Local access without sign-in is not permitted in production")
ORIGINS = os.getenv("SENSA_ORIGINS", "http://127.0.0.1:3001,http://localhost:3001").split(",")
MAX_UPLOAD = int(os.getenv("SENSA_MAX_UPLOAD_MB", "2048")) * 1024 * 1024
MAX_DURATION = int(os.getenv("SENSA_MAX_DURATION", "28800"))
MAX_FRAMES = int(os.getenv("SENSA_MAX_FRAMES", "24"))
MODEL_KEY = os.getenv("MODEL_API_KEY", "")
MODEL_PERCEPTION = os.getenv("SENSA_MODEL_PERCEPTION", "sam-3.1")
MODEL_ANALYSIS = os.getenv("SENSA_MODEL_ANALYSIS", "muse-spark-1.3")
MODEL_ESCALATION = os.getenv("SENSA_MODEL_ESCALATION", "muse-wonder-1.0")
if (MODEL_PERCEPTION, MODEL_ANALYSIS, MODEL_ESCALATION) != ("sam-3.1", "muse-spark-1.3", "muse-wonder-1.0"):
    raise ValueError("Only the reviewed Standard-mode model allowlist is supported")
if MAX_FRAMES < 1 or MAX_FRAMES > 60 or MAX_DURATION < 1 or MAX_DURATION > 28800:
    raise ValueError("Processing limits outside supported bounds")
if PRODUCTION and any("http:" in o for o in ORIGINS):
    raise ValueError("Production requires HTTPS origins")
