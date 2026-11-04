#!/usr/bin/env python3
"""validate_domains.py [docs/domains]: exit 1 se algum domínio não tiver overview.md, business-rules.md e tech-design.md
com os títulos canônicos (domain-documentation-standards.md §1-2). Diretórios iniciados por "_" são ignorados (templates)."""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem os acentos e o print quebraria

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/domains")
REQUIRED = {
    "overview.md": ["## 1. Propósito e Contexto de Negócio", "## 2. Entidades Principais e Relacionamentos", "## 3. Fluxo de Trabalho Geral"],
    "business-rules.md": ["## 1. Regras de Validação e Formatação", "## 2. Máquina de Estados e Ciclo de Vida", "## 3. Matriz de Permissões e Acessos", "## 4. Auditoria, Rastreabilidade e Privacidade"],
    "tech-design.md": ["## 1. Camada Frontend", "## 2. Camada Backend", "## 3. Acesso a Dados, Persistência e Transacionalidade", "## 4. Assinatura de Endpoints", "## 5. Resiliência, Filas e Eventos Assíncronos"],
}
errors = []
if not ROOT.is_dir():
    sys.exit(f"{ROOT}: diretório ausente")
for dom in sorted(p for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith("_")):
    if not re.fullmatch(r"[a-z0-9_]+", dom.name):
        errors.append(f"{dom}: nome deve ser snake_case")
    for name, headings in REQUIRED.items():
        f = dom / name
        if not f.exists():
            errors.append(f"{f}: ausente")
            continue
        text = f.read_text(encoding="utf-8")
        for h in headings:
            if h not in text:
                errors.append(f"{f}: falta a seção '{h}'")
print("\n".join(errors) if errors else f"ok: {ROOT}")
sys.exit(1 if errors else 0)
