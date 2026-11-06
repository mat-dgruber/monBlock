#!/usr/bin/env python3
"""Gera README.md no diretório de ADRs (docs/adrs, ou docs/adr legado) consolidando todas as ADRs (fonte: guia-padrao-criacao-adrs.md §7.1)."""
import os
import re
import subprocess
import sys
import unicodedata

IGNORADOS = {"README.md", "TEMPLATE.md"}
LISTA_LEGADAS = os.path.join(".agents", "scripts", "adr", "adrs-legadas.txt")


def resolver_raiz():  # raiz do git (ou cwd)
    try:
        raiz = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, encoding="utf-8").stdout.strip()
    except OSError:
        raiz = ""
    return raiz or os.getcwd()


def resolver_diretorio_adrs():  # docs/adr legado prevalece, senão docs/adrs (padrão desde a v2.7.4)
    raiz = resolver_raiz()
    legado = os.path.join(raiz, "docs", "adr")
    return legado if os.path.isdir(legado) else os.path.join(raiz, "docs", "adrs")


def normalizar(nome):  # NFC nos dois lados: macOS devolve nomes em NFD, o editor grava NFC
    return unicodedata.normalize("NFC", nome.strip())


def caminho_legadas(raiz):
    return os.path.join(raiz, LISTA_LEGADAS)


def ler_legadas(raiz):  # nomes NFC, sem linhas vazias/comentários; só compara com listdir, nunca abre o nome como caminho
    caminho = caminho_legadas(raiz)
    if not os.path.isfile(caminho):
        return set()
    with open(caminho, "r", encoding="utf-8-sig") as f:
        nomes = (normalizar(linha) for linha in f.read().splitlines())
        return {n for n in nomes if n and not n.startswith("#")}


def numero_legada(nome):  # "ADR-008-ddd.md" -> "ADR-008"; sem dígitos, o nome sem .md
    m = re.match(r"^(.*?\d+)", nome)
    return m.group(1) if m else re.sub(r"\.md$", "", nome)


def gerar_indice_adrs():
    adr_dir = resolver_diretorio_adrs()
    readme_path = os.path.join(adr_dir, "README.md")
    existentes = os.listdir(adr_dir)
    arquivos = sorted([f for f in existentes if re.match(r"^\d{4}-.*\.md$", f)])
    listadas = ler_legadas(resolver_raiz())  # congeladas: listadas antes das novas, na ordem de nome
    legadas = sorted([f for f in existentes if f.endswith(".md") and f not in IGNORADOS and normalizar(f) in listadas
                      and f not in arquivos])

    linhas = [
        "# 📚 Repositório de Architecture Decision Records (ADRs)",
        "",
        "> Índice gerado automaticamente com o status consolidado das decisões arquiteturais.",
        "",
        "| ADR | Título | Status | Data |",
        "| :---: | :--- | :---: | :---: |",
    ]

    for arq in legadas:
        with open(os.path.join(adr_dir, arq), "r", encoding="utf-8") as f:
            conteudo = f.read()
        titulo_match = re.search(r"^#\s+(.+)$", conteudo, re.MULTILINE)
        status_match = re.search(r"\*\*Status\*\*\s*\|\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)", conteudo)
        titulo = titulo_match.group(1).strip() if titulo_match else arq
        status = status_match.group(1) if status_match else "Legada"
        data = status_match.group(2) if status_match else "-"
        linhas.append(f"| [{numero_legada(arq)}]({arq}) | **{titulo}** | `{status}` | {data} |")

    for arq in arquivos:
        caminho = os.path.join(adr_dir, arq)
        with open(caminho, "r", encoding="utf-8") as f:
            conteudo = f.read()

        num = arq.split("-")[0]
        titulo_match = re.search(r"^# ADR \d{4}:\s*(.+)$", conteudo, re.MULTILINE)
        status_match = re.search(r"\*\*Status\*\*\s*\|\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)", conteudo)

        titulo = titulo_match.group(1) if titulo_match else arq
        status = status_match.group(1) if status_match else "Desconhecido"
        data = status_match.group(2) if status_match else "-"

        linhas.append(f"| [{num}]({arq}) | **{titulo}** | `{status}` | {data} |")

    with open(readme_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    print(f"Índice {readme_path} atualizado com sucesso!")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    gerar_indice_adrs()
