#!/usr/bin/env python3
"""npm_script.py <nome>: exit 0 se package.json→scripts[<nome>] existe e não é vazio; 1 se ausente; 2 se não há package.json."""
import json
import sys
from pathlib import Path

if not Path("package.json").exists():
    sys.exit(2)
scripts = json.loads(Path("package.json").read_text(encoding="utf-8")).get("scripts") or {}
sys.exit(0 if scripts.get(sys.argv[1]) else 1)
