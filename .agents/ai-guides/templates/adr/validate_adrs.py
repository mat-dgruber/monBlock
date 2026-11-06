#!/usr/bin/env python3
"""Valida integridade e formato das ADRs em docs/adrs (ou docs/adr legado) (fonte: guia-padrao-criacao-adrs.md §7.2). Exit 1 se houver erros.

ADRs legadas (convenção própria, anteriores ao padrão) ficam em .agents/scripts/adr/adrs-legadas.txt, um nome de
arquivo por linha: o validador as ignora e valida todas as demais. `--congelar-legadas` grava essa lista uma única vez
com as ADRs que hoje reprovam; ADR nova não se congela, corrige-se.
"""
import argparse
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


def eh_template(nome):  # template legado (ex.: template-adr.md) não é ADR e não se renomeia; ADR numerada é sempre validada
    return "template" in nome.lower() and not re.match(r"^\d{4}-", nome)


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


def listar_adrs(adr_dir):
    return [f for f in (os.listdir(adr_dir) if os.path.isdir(adr_dir) else []) if f.endswith(".md") and f not in IGNORADOS and not eh_template(f)]


def erros_da_adr(adr_dir, adr):
    erros = []
    if not re.match(r"^\d{4}-[a-z0-9-]+\.md$", adr):
        erros.append(f"Nome inválido: {adr} (deve seguir 0000-kebab-case.md)")

    with open(os.path.join(adr_dir, adr), "r", encoding="utf-8") as f:
        texto = f.read()

    if "LOG DE MANUTENÇÃO" not in texto:
        erros.append(f"{adr}: Cabeçalho HTML de log de manutenção ausente.")
    if not re.search(r"^# ADR \d{4}:", texto, re.MULTILINE):
        erros.append(f"{adr}: Título principal não segue o padrão '# ADR 0000:'.")
    if "## 2. Decisão de Arquitetura" not in texto:
        erros.append(f"{adr}: Seção '## 2. Decisão de Arquitetura' ausente.")
    return erros


def validar_adrs():
    raiz = resolver_raiz()
    adr_dir = resolver_diretorio_adrs()
    legadas = ler_legadas(raiz)
    erros = []
    ignoradas = 0

    for adr in listar_adrs(adr_dir):
        if normalizar(adr) in legadas:
            ignoradas += 1
            continue
        erros.extend(erros_da_adr(adr_dir, adr))

    if ignoradas:
        print(f"{ignoradas} ADR(s) legada(s) ignorada(s) (lista em .agents/scripts/adr/adrs-legadas.txt)")
    if erros:
        print("\n".join(erros))
        sys.exit(1)
    print("Todas as ADRs estão em conformidade!")


def congelar_legadas():
    raiz = resolver_raiz()
    caminho = caminho_legadas(raiz)
    if os.path.exists(caminho):
        print("lista de legadas já existe: ADR nova não se congela — corrija-a conforme a seção 5 do guia", file=sys.stderr)
        return 2
    adr_dir = resolver_diretorio_adrs()
    reprovadas = sorted(normalizar(a) for a in listar_adrs(adr_dir) if erros_da_adr(adr_dir, a))
    if not reprovadas:
        print("nada a congelar")
        return 0
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    cabecalho = ["# ADRs legadas congeladas pelo /setup (guia padrao-criacao-adrs, ADR-04): ignoradas pelo validador.",
                 "# ADR nova não entra aqui: corrija-a. Apagar este arquivo volta a validar todas."]
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(cabecalho + reprovadas) + "\n")
    print(f"{len(reprovadas)} ADR(s) congelada(s) em .agents/scripts/adr/adrs-legadas.txt")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Valida as ADRs do projeto.")
    parser.add_argument("--congelar-legadas", action="store_true",
                        help="grava .agents/scripts/adr/adrs-legadas.txt com as ADRs que hoje reprovam (uma única vez)")
    args = parser.parse_args()
    if args.congelar_legadas:
        sys.exit(congelar_legadas())
    validar_adrs()
