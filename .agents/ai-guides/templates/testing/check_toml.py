#!/usr/bin/env python3
"""check_toml.py <arquivo>: exit 1 se o TOML for inválido. Sem tomllib (Python < 3.11) apenas confere a existência."""
import sys
from pathlib import Path

p = Path(sys.argv[1])
if not p.exists():
    sys.exit(1)
try:
    import tomllib
except ImportError:
    sys.exit(0)
tomllib.load(p.open("rb"))
