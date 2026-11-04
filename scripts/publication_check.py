"""Scan proposed Git content, reachable history, and documentation links without printing secrets."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = re.compile(
    rb"(?:LLM_[0-9]+_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|"
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Za-z]:[\\/]Users[\\/])"
)
FORBIDDEN = {
    ".env",
    "data",
    "tmp",
    "output",
    "node_modules",
    ".next",
    ".venv",
    "__pycache__",
}
MEDIA = {
    "demo/walkthrough.mp4",
    "demo/sources/synthetic-camera-1.mp4",
    "demo/sources/synthetic-camera-2.mp4",
}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def main():
    names = (
        git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .decode()
        .strip("\0")
        .split("\0")
    )
    errors = []
    key = b""
    private = ROOT / ".env"
    if private.is_file():
        match = re.search(rb"(?m)^MODEL_API_KEY\s*=\s*([^\r\n]+)", private.read_bytes())
        key = match[1].strip().strip(b"\"'") if match else b""

    def check(name, data):
        if TOKEN.search(data) or (key and key in data):
            errors.append(f"Sensitive content in {name}")

    for name in names:
        path = ROOT / name
        if (
            set(Path(name).parts) & FORBIDDEN
            or (Path(name).name.startswith(".env") and name != ".env.example")
            or path.suffix in {".db", ".sqlite", ".sqlite3", ".pem", ".key", ".zip"}
            or (path.suffix in {".mp4", ".mov", ".avi", ".mkv"} and name not in MEDIA)
        ):
            errors.append(f"Private or unexpected release path {name}")
        if path.is_file():
            check(name, path.read_bytes())
    history = git("rev-list", "--objects", "--all").decode().splitlines()
    for line in history:
        oid, _, name = line.partition(" ")
        if git("cat-file", "-t", oid).strip() == b"blob":
            check(f"history {oid} {name}", git("cat-file", "blob", oid))
    # Inspect generated JavaScript for the configured credential, separately from publishable files.
    for path in (ROOT / "frontend/.next").rglob("*.js"):
        if key and key in path.read_bytes():
            errors.append("Configured credential in frontend build")
    for name in names:
        if not name.endswith(".md"):
            continue
        path = ROOT / name
        for target in re.findall(
            r"!?(?:\[[^\]]*\])\(([^)]+)\)", path.read_text(encoding="utf-8")
        ):
            target = target.strip("<>").split("#", 1)[0]
            if not target or re.match(r"(?:https?://|mailto:)", target):
                continue
            if not (path.parent / target).exists():
                errors.append(f"Broken relative documentation link in {name}: {target}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(
        f"PASS {len(names)} publication paths and {len(history)} reachable Git objects scanned; local documentation links resolve"
    )


if __name__ == "__main__":
    main()
