#!/usr/bin/env python3
"""check_ruff_rules.py [--declared] CODE [CODE...]: exit 0 se cada código (ou um prefixo dele, ex. S cobre S113; ALL cobre
tudo) estiver em [tool.ruff.lint] select/extend-select de pyproject.toml, ruff.toml ou .ruff.toml. Com --declared, exige
também o ruff declarado (dependência no pyproject, requirements*.txt ou hook do pre-commit): regra sem ruff instalável
não fiscaliza nada. Exit 1 se faltar; 2 se não há config."""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem os acentos e o print quebraria

try:
    import tomllib
except ImportError:  # Python < 3.11
    sys.exit(2)

DECLARADO = re.compile(r"""^\s*["']?ruff\b|["']ruff[\s<>=~!\[\]"',;]|ruff-pre-commit""", re.M)


def ruff_declarado() -> bool:
    fontes = [Path("pyproject.toml"), *sorted(Path(".").glob("requirements*.txt")), Path(".pre-commit-config.yaml")]
    return any(p.exists() and DECLARADO.search(p.read_text(encoding="utf-8")) for p in fontes)


args = sys.argv[1:]
declared = "--declared" in args
codes = [c for c in args if c != "--declared"]
cfg = None
for name in ("pyproject.toml", "ruff.toml", ".ruff.toml"):
    p = Path(name)
    if p.exists():
        data = tomllib.load(p.open("rb"))
        cfg = data.get("tool", {}).get("ruff") if name == "pyproject.toml" else data
        if cfg is not None:
            break
if cfg is None:
    sys.exit(2)
lint = cfg.get("lint", cfg)
selected = set(lint.get("select", [])) | set(lint.get("extend-select", []))
missing = [c for c in codes if "ALL" not in selected and not any(c.startswith(s) for s in selected)]
problemas = (["faltam em select/extend-select: " + ", ".join(missing)] if missing else []) + \
            (["ruff não declarado (pyproject, requirements*.txt ou pre-commit)"] if declared and not ruff_declarado() else [])
print("; ".join(problemas) or "ok")
sys.exit(1 if problemas else 0)
