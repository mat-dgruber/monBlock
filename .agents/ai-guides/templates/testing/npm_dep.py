#!/usr/bin/env python3
"""npm_dep.py <pacote> [<pacote>...]: exit 0 se ALGUM dos pacotes está em dependencies/devDependencies do package.json; 1 se nenhum; 2 se não há package.json."""
import json
import sys
from pathlib import Path

if not Path("package.json").exists():
    sys.exit(2)
pkg = json.loads(Path("package.json").read_text(encoding="utf-8"))
deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
sys.exit(0 if any(p in deps for p in sys.argv[1:]) else 1)
