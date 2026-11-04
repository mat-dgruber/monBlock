#!/usr/bin/env python3
"""Verifica se a versão declarada do projeto segue SemVer 2.0.0 (semver-versioning-guide.md §1).

Exit: 0 = válida · 1 = inválida/ausente · 2 = nenhum manifesto reconhecido (não aplicável).
"""
import json
import re
import sys
from pathlib import Path

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None

SEMVER = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$")


def declared_version() -> str | None:
    if Path("package.json").exists():
        return json.loads(Path("package.json").read_text(encoding="utf-8")).get("version")
    if Path("pyproject.toml").exists():
        if tomllib is not None:
            try:
                data = tomllib.loads(Path("pyproject.toml").read_text(encoding="utf-8"))
                ver = (
                    data.get("project", {}).get("version")
                    or data.get("tool", {}).get("poetry", {}).get("version")
                    or data.get("version")
                )
                if ver:
                    return str(ver)
            except Exception:
                pass
        m = re.search(r'^\s*version\s*=\s*"([^"]+)"', Path("pyproject.toml").read_text(encoding="utf-8"), re.MULTILINE)
        return m.group(1) if m else None
    if Path("VERSION").exists():
        return Path("VERSION").read_text(encoding="utf-8").strip()
    sys.exit(2)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    v = declared_version()
    ok = bool(v and SEMVER.match(v))
    print(f"versão declarada: {v!r} → {'válida' if ok else 'inválida'} (SemVer 2.0.0)")
    sys.exit(0 if ok else 1)
