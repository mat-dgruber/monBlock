#!/usr/bin/env python3
"""merge_hooks.py TEMPLATE.json SETTINGS.json [--event EV] [--matcher M] [--replace REGEX] [--check]

Mescla os hooks do template no settings.json do harness (Claude Code ou Gemini CLI) sem perder o que já
existe. --event/--matcher restringem o que vem do template; --replace remove antes, do settings, todo hook
cujo command case com a regex (versões antigas do mesmo hook) e lista cada um como `substituído:`. Idempotente: command já presente no evento
não é duplicado. Cria o settings se não existir; settings com JSON inválido → exit 1 sem tocar no arquivo.
--check não escreve nada: exit 0 se todo command do template (já filtrado) está no evento certo do settings;
senão lista os que faltam e sai 1 (when/verify do GRAPH-04/05).
Fonte: templates/harness/merge_hooks.py — GRAPH-04/05, HN3-04/05/06, NOTIF-02.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def presentes(alvo: dict, ev: str) -> set:
    """Commands já registrados no evento (ignora entradas fora do schema)."""
    return {h.get("command") for x in alvo.get(ev, []) if isinstance(x, dict)
            for h in x.get("hooks") or [] if isinstance(h, dict)}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("template", type=Path)
    ap.add_argument("settings", type=Path)
    ap.add_argument("--event")
    ap.add_argument("--matcher")
    ap.add_argument("--replace")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    tpl = json.loads(a.template.read_text(encoding="utf-8"))["hooks"]
    try:
        data = json.loads(a.settings.read_text(encoding="utf-8")) if a.settings.exists() else {}
    except json.JSONDecodeError as e:
        print(f"❌ {a.settings}: JSON inválido ({e}) — corrija antes do merge", file=sys.stderr)
        return 1
    alvo = data.setdefault("hooks", {})
    pares = [(ev, e) for ev, es in tpl.items() if a.event in (None, ev)
             for e in es if a.matcher in (None, e.get("matcher"))]
    if not pares:
        print(f"❌ nada no template para --event={a.event} --matcher={a.matcher}", file=sys.stderr)
        return 1
    if a.check:
        faltam = [f"{ev}[{e.get('matcher', '*')}]: {h['command']}" for ev, e in pares for h in e["hooks"]
                  if h["command"] not in presentes(alvo, ev)]
        for f in faltam:
            print(f"falta: {f}", file=sys.stderr)
        return 1 if faltam else 0
    removidos = []
    if a.replace:
        rx = re.compile(a.replace)
        do_template = {h["command"] for _, e in pares for h in e["hooks"]}  # já idêntico ao template: fica onde está
        for ev in {ev for ev, _ in pares}:
            mantidas = []
            for e in alvo.get(ev, []):
                hs = e.get("hooks") if isinstance(e, dict) else None
                if isinstance(hs, list):
                    fora = [h for h in hs if isinstance(h, dict) and h.get("command") not in do_template
                            and rx.search(h.get("command", ""))]
                    e["hooks"] = [h for h in hs if h not in fora]
                    removidos += [h.get("command") for h in fora]
                    if hs and not e["hooks"]:
                        continue  # só descarta a entrada que o --replace esvaziou
                mantidas.append(e)
            alvo[ev] = mantidas
    feitos = []
    for ev, e in pares:
        existentes = presentes(alvo, ev)
        novos = [h for h in e["hooks"] if h["command"] not in existentes]
        if novos:
            alvo.setdefault(ev, []).append({**e, "hooks": novos})
            feitos.append(f"{ev}[{e.get('matcher', '*')}]")
    a.settings.parent.mkdir(parents=True, exist_ok=True)
    a.settings.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for c in removidos:
        print(f"substituído: {c}")
    print("mesclado: " + ", ".join(feitos) if feitos else "nada a mesclar (hooks já presentes)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
