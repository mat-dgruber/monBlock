#!/usr/bin/env python3
"""Valida integridade e formato das ADRs em docs/adrs (ou docs/adr legado) (fonte: guia-padrao-criacao-adrs.md §7.2). Exit 1 se houver erros."""
import os
import re
import subprocess
import sys
from pathlib import Path

IGNORADOS = {"README.md", "TEMPLATE.md"}


def resolver_diretorio_adrs(caminho=None) -> Path:  # raiz do git (ou cwd); docs/adr legado prevalece, senão docs/adrs (padrão desde a v2.7.4)
    if caminho:
        return Path(caminho)
    try:
        raiz = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, encoding="utf-8").stdout.strip()
    except OSError:
        raiz = ""
    base = Path(raiz) if raiz else Path.cwd()
    legado = base / "docs" / "adr"
    return legado if legado.is_dir() else base / "docs" / "adrs"


def eh_template(nome):  # template legado (ex.: template-adr.md) não é ADR e não se renomeia; ADR numerada é sempre validada
    return "template" in nome.lower() and not re.match(r"^\d{4}-", nome)


def validar_adrs(diretorio=None):
    adr_dir = resolver_diretorio_adrs(diretorio)
    if not adr_dir.exists():
        print(f"❌ Diretório de ADRs {adr_dir} não existe.")
        sys.exit(1)

    arquivos = sorted([
        f for f in adr_dir.glob("*.md")
        if f.name not in IGNORADOS and not eh_template(f.name)
    ])

    if not arquivos:
        print("ℹ️ Nenhuma ADR encontrada para validar no diretório.")
        sys.exit(0)

    erros = []
    numeros_encontrados = []

    for arq in arquivos:
        nome = arq.name
        match_nome = re.match(r"^(\d{4})-([a-z0-9-]+)\.md$", nome)
        if not match_nome:
            erros.append(f"Nome inválido: {nome} (deve seguir 0000-kebab-case.md)")
            continue

        numero = int(match_nome.group(1))
        numeros_encontrados.append(numero)

        conteudo = arq.read_text(encoding="utf-8")

        if "LOG DE MANUTENÇÃO" not in conteudo.upper():
            erros.append(f"{nome}: Cabeçalho HTML de log de manutenção ausente.")
        if not re.search(r"^# ADR \d{4}:", conteudo, re.MULTILINE):
            erros.append(f"{nome}: Título principal não segue o padrão '# ADR 0000:'.")
        if not re.search(r"\*{0,2}status\*{0,2}\s*[:|]", conteudo, re.IGNORECASE):
            erros.append(f"{nome}: Campo obrigatório 'Status' ausente nos metadados.")
        if not re.search(r"\*{0,2}decisores\*{0,2}\s*[:|]", conteudo, re.IGNORECASE):
            erros.append(f"{nome}: Campo obrigatório 'Decisores' ausente nos metadados.")
        if "## 2. Decisão de Arquitetura" not in conteudo:
            erros.append(f"{nome}: Seção '## 2. Decisão de Arquitetura' ausente.")

    if numeros_encontrados:
        numeros_ordenados = sorted(numeros_encontrados)
        primeiro = numeros_ordenados[0]
        ultimo = numeros_ordenados[-1]
        esperados = list(range(primeiro, ultimo + 1))
        faltantes = set(esperados) - set(numeros_ordenados)
        if faltantes:
            formatados = [f"{n:04d}" for n in sorted(faltantes)]
            erros.append(f"Lacuna na numeração sequencial de ADRs! Números faltantes: {formatados}")

    if erros:
        print("\n".join(erros))
        sys.exit(1)
    print("Todas as ADRs estão em conformidade!")


validar_conformidade_adrs = validar_adrs


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
        print("Uso: python3 validate_adrs.py [caminho_para_o_diretorio_de_adrs]")
        sys.exit(0)
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    validar_adrs(caminho)
