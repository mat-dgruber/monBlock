#!/usr/bin/env python3
"""verify_hooks.py [settings.json …]: prova que os hooks configurados rodam sem erro.

Por hook: (1) o settings é JSON válido e segue o schema {evento: [{matcher?, hooks: [{type, command…}]}]},
(2) a linha de comando tem sintaxe de shell válida (`sh -n`), (3) todo executável citado existe no PATH
(inclui ~/.local/bin) ou, citado por caminho (/…, ~/…, $HOME/…), existe e é executável e (4) todo script
local ou do home referenciado existe, é executável e compila. Exit 1 em qualquer falha.
Padrão: .claude/settings.json e .gemini/settings.json. Fonte: templates/harness/verify_hooks.py — HARNESS-16.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULTS = [".claude/settings.json", ".gemini/settings.json"]
PATH = os.environ.get("PATH", "") + os.pathsep + str(Path.home() / ".local" / "bin")
KEYWORDS = {"if", "then", "elif", "else", "fi", "for", "while", "until", "do", "done", "case", "esac",
            "function", "return", "exit", "echo", "printf", "true", "false", "cd", "export", "set",
            "read", "local", "eval", "exec", "shift", "trap", "wait", "time", "source"}
SCRIPT_RE = re.compile(r"[\w./~$-]+\.(?:sh|py|js)\b")


def commands(node) -> list[str]:
    if isinstance(node, dict):
        found = [node["command"]] if isinstance(node.get("command"), str) else []
        return found + [c for v in node.values() for c in commands(v)]
    if isinstance(node, list):
        return [c for v in node for c in commands(v)]
    return []


def normalize(cmd: str) -> str:
    """"$VAR"/x e ${VAR}/x viram $VAR/x; $HOME vira ~ e a raiz do projeto ($ROOT, $CLAUDE_PROJECT_DIR) vira ./."""
    cmd = re.sub(r'"(\$\{?\w+\}?)"', r"\1", cmd)
    cmd = re.sub(r"\$\{(\w+)\}", r"$\1", cmd)
    cmd = re.sub(r"\$HOME\b", "~", cmd)
    return re.sub(r"\$(ROOT|CLAUDE_PROJECT_DIR)/", "./", cmd)


def executables(cmd: str) -> set[str]:
    """Programas invocados na linha (nome ou caminho), ignorando o que está entre aspas."""
    bare = re.sub(r"'[^']*'|\"[^\"]*\"", " ", cmd)
    names = set()
    for part in re.split(r"[|;&]+|\$\(|\(|\)|`|\n", bare):
        for word in part.split():
            if "=" in word.split("/")[0]:  # VAR=valor antes do comando
                continue
            if word.startswith(("/", "~/")) or (re.fullmatch(r"[A-Za-z][\w.+-]*", word) and word not in KEYWORDS):
                names.add(word)
            break
    return names


def schema_errors(hooks) -> list[str]:
    """Schema dos dois harnesses: {evento: [{matcher?, hooks: [{type, command…}]}]}."""
    if not isinstance(hooks, dict):
        return ["'hooks' deve ser objeto {evento: [entradas]}"]
    errs = []
    for ev, entries in hooks.items():
        if not isinstance(entries, list):
            errs.append(f"{ev}: deve ser lista de entradas")
            continue
        for i, e in enumerate(entries):
            hs = e.get("hooks") if isinstance(e, dict) else None
            if not isinstance(hs, list) or not all(isinstance(h, dict) for h in hs):
                veio = sorted(e) if isinstance(e, dict) else type(e).__name__
                errs.append(f"{ev}[{i}]: esperado {{matcher, hooks: [{{type, command}}]}}, veio {veio}")
    return errs


def expand(p: str) -> str:
    """~ do hook é o $HOME do shell que o roda; no Windows, o expanduser do Python usaria o USERPROFILE."""
    home = os.environ.get("HOME")
    return home + p[1:] if home and (p == "~" or p.startswith("~/")) else os.path.expanduser(p)


def runnable(name: str, root: Path) -> bool:
    if "/" in name:
        return os.access(expand(name), os.X_OK)
    return bool(shutil.which(name, path=PATH)) or (root / name).exists()


def check(cmd: str, root: Path) -> list[str]:
    errs = []
    # pelo stdin: no Windows, o Git Bash reparte o argv com regras próprias e quebra comando que começa com aspas
    if subprocess.run(["sh", "-n"], input=cmd.encode("utf-8"), capture_output=True).returncode:
        errs.append("sintaxe de shell inválida")
    cmd = normalize(cmd)
    for name in sorted(executables(cmd)):
        if not runnable(name, root):
            errs.append(f"{name}: executável ausente ou sem permissão" if "/" in name else f"{name}: não encontrado no PATH")
    for ref in sorted(set(SCRIPT_RE.findall(cmd))):
        rel = re.sub(r"^(\./)+", "", ref)  # ./… (e $ROOT/…, já normalizado) parte da raiz
        if rel.startswith("$"):
            continue
        path = Path(expand(rel)) if rel.startswith(("/", "~")) else root / rel
        if not path.exists():
            errs.append(f"{ref}: script referenciado ausente")
            continue
        if path.suffix == ".sh":
            r = subprocess.run(["sh", "-n", str(path)], capture_output=True, encoding="utf-8", errors="replace")
            if r.returncode:
                errs.append(f"{ref}: erro de sintaxe ({r.stderr.strip()[:60]})")
            elif not os.access(path, os.X_OK):
                errs.append(f"{ref}: sem permissão de execução")
        elif path.suffix == ".js":
            node_bin = shutil.which("node", path=PATH)
            if node_bin:
                try:
                    r = subprocess.run([node_bin, "-c", str(path)], capture_output=True, encoding="utf-8", errors="replace", env={**os.environ, "PATH": PATH})
                    if r.returncode:
                        errs.append(f"{ref}: erro de sintaxe JS ({r.stderr.strip()[:60]})")
                except FileNotFoundError:
                    node_bin = None
            if not node_bin and "mods/" not in rel and not any("node" in e for e in errs):
                errs.append(f"{ref}: node não encontrado no PATH")
        else:
            src = f"compile(open({str(path)!r}, encoding='utf-8').read(), {str(path)!r}, 'exec')"
            r = subprocess.run([sys.executable, "-B", "-c", src], capture_output=True, encoding="utf-8", errors="replace")
            if r.returncode:
                errs.append(f"{ref}: não compila ({r.stderr.strip()[-60:]})")
    return errs


def main(argv: list[str]) -> int:
    root = Path.cwd()
    paths = [Path(p) for p in (argv or DEFAULTS)]
    total = failures = 0
    for path in paths:
        if not path.exists():
            if argv:
                print(f"❌ {path}: ausente")
                failures += 1
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"❌ {path}: JSON inválido ({e})")
            failures += 1
            continue
        cmds = commands(data.get("hooks", data))
        print(f"• {path}: JSON válido, {len(cmds)} hook(s)")
        for e in schema_errors(data["hooks"]) if "hooks" in data else []:
            print(f"  ❌ {e}")
            failures += 1
        for cmd in cmds:
            total += 1
            errs = check(cmd, root)
            failures += bool(errs)
            print(f"  {'✅' if not errs else '❌'} {cmd.splitlines()[0][:88]}")
            for e in errs:
                print(f"     ↳ {e}")
    print(f"ok: {total} hook(s) executáveis" if not failures else f"❌ {failures} hook(s) com problema")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
