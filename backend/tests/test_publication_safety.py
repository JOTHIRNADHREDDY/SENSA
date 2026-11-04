import importlib.util
import json
import uuid
from pathlib import Path

import pytest


@pytest.mark.parametrize("setting", ["MODEL_API_KEY", "POSTGRES_PASSWORD", "bootstrap_password"])
def test_publication_guard_rejects_configured_credentials_without_printing_them(tmp_path, monkeypatch, capsys, setting):
    script = Path(__file__).resolve().parents[2] / "scripts/publication_check.py"
    spec = importlib.util.spec_from_file_location("publication_check", script)
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    monkeypatch.setattr(checker, "ROOT", tmp_path)
    monkeypatch.setattr(checker, "git", lambda *args: b"public.txt\0" if args[0] == "ls-files" else b"")
    credential = uuid.uuid4().hex
    if setting == "bootstrap_password":
        (tmp_path / "data").mkdir()
        (tmp_path / "data/local-access.json").write_text(json.dumps({"password": credential}))
    else:
        (tmp_path / ".env").write_text(f'{setting}="{credential}"\n')
    public = tmp_path / "public.txt"
    public.write_text(credential)
    with pytest.raises(SystemExit, match="Sensitive content") as error:
        checker.main()
    assert credential not in str(error.value)
    public.write_text("Public documentation")
    checker.main()
    bundle = tmp_path / "frontend/.next/static/client.js"
    bundle.parent.mkdir(parents=True)
    bundle.write_text(credential)
    with pytest.raises(SystemExit, match="Configured credential in frontend build") as error:
        checker.main()
    assert credential not in str(error.value)
    assert credential not in capsys.readouterr().out
