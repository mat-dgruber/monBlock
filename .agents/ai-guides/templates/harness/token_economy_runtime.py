#!/usr/bin/env python3
"""Motor Runtime determinístico para Token Economy, Stoneage Ultra e Ponytail Ultra.

Eventos suportados:
- session-start  : Inicializa ~/.config/stoneage/ e ~/.config/ponytail/ em modo ultra/on,
                   zera o session-budget da sessão e emite diretivas compactas no contexto.
- subagent-start : Propaga diretivas de economia de tokens e YAGNI para subagentes.
- prompt-submit  : Processa comandos (/stoneage, /token-economy, /ponytail, stop stoneage,
                   modo normal, stop budget) e atualiza o score em session-budget.json.
- init-defaults  : Garante que os arquivos globais de configuração existam com padrão ultra/on.
- status         : Exibe o estado atual em JSON.
- --reset        : Restaura configurações padrão e zera o orçamento da sessão.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SKILLS = [
    "answer-first",
    "task-batch",
    "session-budget",
    "silent-tools",
    "context-trim",
    "memory-prune",
    "stoneage",
    "stoneage-commit",
    "stoneage-review",
]

DEFAULT_STONEAGE_CONFIG = {
    "defaultMode": "ultra",
    "activeMode": "ultra",
    "tokenEconomy": "on",
    "ponytailMode": "ultra",
    "activeSkills": DEFAULT_SKILLS,
}

DEFAULT_PONYTAIL_CONFIG = {
    "defaultMode": "ultra",
}


def _stoneage_dir() -> Path:
    env_dir = os.environ.get("STONEAGE_CONFIG_DIR")
    if env_dir:
        return Path(env_dir)
    return Path.home() / ".config" / "stoneage"


def _ponytail_dir() -> Path:
    env_dir = os.environ.get("PONYTAIL_CONFIG_DIR")
    if env_dir:
        return Path(env_dir)
    return Path.home() / ".config" / "ponytail"


def _read_json(path: Path) -> dict:
    try:
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def ensure_configs(force_ultra: bool = False) -> tuple[dict, dict]:
    """Garante a existência e integridade de ~/.config/stoneage/config.json e ~/.config/ponytail/config.json."""
    s_dir = _stoneage_dir()
    p_dir = _ponytail_dir()
    s_cfg_path = s_dir / "config.json"
    p_cfg_path = p_dir / "config.json"

    s_cfg = _read_json(s_cfg_path)
    changed_s = False
    for k, v in DEFAULT_STONEAGE_CONFIG.items():
        if force_ultra or k not in s_cfg:
            if s_cfg.get(k) != v:
                s_cfg[k] = v
                changed_s = True
    if changed_s or not s_cfg_path.is_file():
        _write_json(s_cfg_path, s_cfg)

    p_cfg = _read_json(p_cfg_path)
    changed_p = False
    if force_ultra or "defaultMode" not in p_cfg:
        if p_cfg.get("defaultMode") != "ultra":
            p_cfg["defaultMode"] = "ultra"
            changed_p = True
    if changed_p or not p_cfg_path.is_file():
        _write_json(p_cfg_path, p_cfg)

    return s_cfg, p_cfg


def init_session_budget(s_cfg: dict) -> dict:
    """Inicializa ou lê o arquivo session-budget.json na abertura da sessão."""
    b_path = _stoneage_dir() / "session-budget.json"
    mode = s_cfg.get("activeMode") or s_cfg.get("defaultMode", "ultra")
    budget = {
        "turns": 0,
        "score": 0.0,
        "mode": mode,
        "tokenEconomy": s_cfg.get("tokenEconomy", "on"),
        "ponytailMode": s_cfg.get("ponytailMode", "ultra"),
        "userOverride": False,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(b_path, budget)
    return budget


def _extract_prompt(raw_stdin: str) -> str:
    if not raw_stdin or not raw_stdin.strip():
        return ""
    try:
        payload = json.loads(raw_stdin)
        if isinstance(payload, dict):
            for key in ("prompt", "user_prompt", "message", "content", "input"):
                val = payload.get(key)
                if isinstance(val, str):
                    return val
    except Exception:
        return raw_stdin.strip()
    return ""


def _scale_mode_by_score(score: float, current_mode: str, default_mode: str, user_override: bool) -> str:
    if current_mode == "off" or user_override:
        return current_mode
    if default_mode == "ultra":
        return "ultra"
    if score >= 50:
        return "ultra"
    if score >= 25:
        return "full"
    if score >= 10:
        return "lite"
    return current_mode


def handle_session_start() -> int:
    s_cfg, _ = ensure_configs(force_ultra=False)
    budget = init_session_budget(s_cfg)
    te_state = s_cfg.get("tokenEconomy", "on").upper()
    st_mode = budget.get("mode", "ultra").upper()
    pt_mode = s_cfg.get("ponytailMode", "ultra").upper()

    if te_state == "OFF" and st_mode == "OFF":
        return 0

    skills_str = ", ".join(s_cfg.get("activeSkills", DEFAULT_SKILLS))
    print(
        f"TOKEN ECONOMY ACTIVE ({te_state}) · STONEAGE MODE: {st_mode} · PONYTAIL MODE: {pt_mode}\n"
        f"- Stoneage ({st_mode.lower()}): respostas ultra-compactas (~75% economia), sem preâmbulos ou artigos supérfluos, "
        f"setas para causalidade (X -> Y), preservando 100% da precisão técnica, blocos de código e idioma pt-BR.\n"
        f"- Ponytail ({pt_mode.lower()}): menor diff correto, stdlib/nativo primeiro, zero abstrações especulativas (YAGNI absoluto).\n"
        f"- Skills Ativas: {skills_str}.\n"
        f"- Controle: /stoneage [lite|full|ultra|off] | /token-economy [on|off] | /ponytail [lite|full|ultra|off] | stop stoneage"
    )
    return 0


def handle_subagent_start() -> int:
    s_cfg, _ = ensure_configs(force_ultra=False)
    te_state = s_cfg.get("tokenEconomy", "on").upper()
    st_mode = (s_cfg.get("activeMode") or s_cfg.get("defaultMode", "ultra")).upper()
    pt_mode = s_cfg.get("ponytailMode", "ultra").upper()

    if te_state == "OFF" and st_mode == "OFF":
        return 0

    out = {
        "hookSpecificOutput": {
            "hookEventName": "SubagentStart",
            "additionalContext": (
                f"TOKEN ECONOMY {te_state} · STONEAGE {st_mode} · PONYTAIL {pt_mode}: "
                "opera em modo ultra-compacto (answer-first, silent-tools, task-batch) e YAGNI estrito."
            ),
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


def handle_prompt_submit(raw_stdin: str) -> int:
    s_cfg, p_cfg = ensure_configs(force_ultra=False)
    b_path = _stoneage_dir() / "session-budget.json"
    budget = _read_json(b_path)
    if not budget:
        budget = init_session_budget(s_cfg)

    prompt = _extract_prompt(raw_stdin)
    lower = prompt.lower().strip()
    notices: list[str] = []

    # 1. Detecta comandos /stoneage ou stop stoneage / modo normal
    m_stone = re.search(r"(?:^|\s)/?stoneage\s+(lite|full|ultra|off)\b", lower)
    if m_stone:
        new_mode = m_stone.group(1)
        s_cfg["activeMode"] = new_mode
        budget["mode"] = new_mode
        budget["userOverride"] = True
        notices.append(f"STONEAGE MODE -> {new_mode.upper()}")
    elif re.search(r"\b(stop stoneage|modo normal|normal mode)\b", lower):
        s_cfg["activeMode"] = "off"
        budget["mode"] = "off"
        budget["score"] = 0.0
        budget["turns"] = 0
        budget["userOverride"] = True
        notices.append("STONEAGE MODE -> OFF (budget resetado)")

    # 2. Detecta comandos /token-economy ou liga/desliga token economy
    m_te = re.search(r"(?:^|\s)/?token[- ]economy\s+(on|off)\b", lower)
    if not m_te:
        if "liga token economy" in lower:
            te_val = "on"
        elif "desliga token economy" in lower:
            te_val = "off"
        else:
            te_val = None
    else:
        te_val = m_te.group(1)

    if te_val:
        s_cfg["tokenEconomy"] = te_val
        budget["tokenEconomy"] = te_val
        if te_val == "on" and s_cfg.get("activeMode") == "off":
            s_cfg["activeMode"] = s_cfg.get("defaultMode", "ultra")
            budget["mode"] = s_cfg["activeMode"]
            budget["userOverride"] = False
        notices.append(f"TOKEN ECONOMY -> {te_val.upper()}")

    # 3. Detecta comandos /ponytail ou stop ponytail
    m_pony = re.search(r"(?:^|\s)/?ponytail\s+(lite|full|ultra|off)\b", lower)
    if m_pony:
        p_mode = m_pony.group(1)
        s_cfg["ponytailMode"] = p_mode
        budget["ponytailMode"] = p_mode
        if p_mode in ("lite", "full", "ultra"):
            p_cfg["defaultMode"] = p_mode
            _write_json(_ponytail_dir() / "config.json", p_cfg)
        notices.append(f"PONYTAIL MODE -> {p_mode.upper()}")
    elif "stop ponytail" in lower:
        s_cfg["ponytailMode"] = "off"
        budget["ponytailMode"] = "off"
        notices.append("PONYTAIL MODE -> OFF")

    # 4. Detecta stop budget
    if "stop budget" in lower:
        budget["score"] = 0.0
        budget["turns"] = 0
        notices.append("SESSION BUDGET -> RESET (0.0)")
    else:
        turns = int(budget.get("turns", 0)) + 1
        delta = 1.0 + (0.5 if len(prompt) > 500 else 0.0)
        score = round(float(budget.get("score", 0.0)) + delta, 1)
        budget["turns"] = turns
        budget["score"] = score
        budget["mode"] = _scale_mode_by_score(
            score,
            str(budget.get("mode", s_cfg.get("activeMode", "ultra"))),
            str(s_cfg.get("defaultMode", "ultra")),
            bool(budget.get("userOverride", False)),
        )

    budget["updatedAt"] = datetime.now(timezone.utc).isoformat()
    _write_json(_stoneage_dir() / "config.json", s_cfg)
    _write_json(b_path, budget)

    if notices:
        print(" · ".join(notices))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    cmd = args[0] if args else "session-start"

    if cmd in ("init-defaults", "--init-defaults"):
        s_cfg, _ = ensure_configs(force_ultra=True)
        init_session_budget(s_cfg)
        return 0
    if cmd in ("reset", "--reset"):
        s_cfg, _ = ensure_configs(force_ultra=True)
        init_session_budget(s_cfg)
        print("Token Economy, Stoneage Ultra e Ponytail Ultra restaurados para o padrão.")
        return 0
    if cmd in ("status", "--status"):
        s_cfg, p_cfg = ensure_configs(force_ultra=False)
        budget = _read_json(_stoneage_dir() / "session-budget.json")
        if budget and "mode" in budget:
            s_cfg["activeMode"] = budget["mode"]
        if budget and "ponytailMode" in budget:
            s_cfg["ponytailMode"] = budget["ponytailMode"]
        print(json.dumps({"stoneage": s_cfg, "ponytail": p_cfg, "budget": budget}, indent=2, ensure_ascii=False))
        return 0
    if cmd == "subagent-start":
        return handle_subagent_start()
    if cmd == "prompt-submit":
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        return handle_prompt_submit(raw)
    return handle_session_start()


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
        sys.exit(main())
    except Exception:
        # Fail-open estrito: nenhum erro inesperado deve bloquear o agente
        sys.exit(0)
