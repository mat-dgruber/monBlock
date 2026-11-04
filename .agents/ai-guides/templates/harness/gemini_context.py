#!/usr/bin/env python3
"""gemini_context.py [--check] <.gemini/settings.json> <template.json>: faz o Gemini CLI ler AGENTS.md.

Sem --check: arquivo ausente → copia o template; existente → acrescenta AGENTS.md e GEMINI.md a context.fileName
(string vira lista, sem duplicar), preservando todas as demais chaves. GEMINI.md fica na lista para o Gemini seguir
lendo o ~/.gemini/GEMINI.md pessoal. Imprime `criado`, `mesclado` ou `completo`.
--check: exit 1 se faltar o arquivo, a chave hooks ou AGENTS.md em context.fileName. Fonte: templates/harness — HARNESS-08.
"""
import json
import shutil
import sys
from pathlib import Path

NOMES = ("AGENTS.md", "GEMINI.md")


def ler(alvo: Path) -> tuple[dict, list[str]]:
    """Lê o settings e devolve (dict, context.fileName como lista); ValueError se o formato for inesperado."""
    d = json.loads(alvo.read_text(encoding="utf-8-sig"))  # utf-8-sig: settings salvo com BOM (Notepad)
    ctx = d.get("context", {}) if isinstance(d, dict) else None
    v = ctx.get("fileName") or [] if isinstance(ctx, dict) else None
    if v is None or not isinstance(v, (str, list)):
        raise ValueError("esperado objeto JSON com context objeto e fileName string ou lista")
    return d, [v] if isinstance(v, str) else v


def main(argv: list[str]) -> int:
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    alvo, tpl = Path(args[0]), Path(args[1])
    if not check and not alvo.exists():
        alvo.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(tpl, alvo)
        print("criado")
        return 0
    try:
        d, atual = ler(alvo)
    except (OSError, ValueError) as e:
        print(f"{alvo}: {e}", file=sys.stderr)
        return 1
    if check:
        return 0 if "hooks" in d and "AGENTS.md" in atual else 1
    novo = atual + [n for n in NOMES if n not in atual]
    if novo == atual and "hooks" in d and isinstance(d["context"].get("fileName"), list):
        print("completo")
        return 0
    d.setdefault("context", {})["fileName"] = novo
    if "hooks" not in d:  # settings sem hooks (só MCPs): traz os do template em vez de fingir com {}
        d["hooks"] = json.loads(tpl.read_text(encoding="utf-8"))["hooks"]
    alvo.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("mesclado")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
